import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  type EmailDetail,
  type EmailListItem,
  type EmailListResponse,
  type MailStatus,
  type MailSyncResult,
  type ScreenResult,
} from '@job-harvester/shared';
import { desc, eq, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getMailConfig } from '../../config/mail.config';
import { DATABASE, type AppDatabase } from '../../db/database.provider';
import { attachment, email, syncState } from '../../db/schema';
import {
  MAIL_CREDENTIALS_STORE,
  type MailCredentialsStore,
} from './credentials';
import {
  MAILBOX_CONNECTOR,
  matchConfiguredFolders,
  type MailboxConnector,
  type MailboxSession,
} from './imap.client';
import { writeMailFiles } from './mail-storage';
import { parseMailSource } from './parse-mail';

const BODY_PREVIEW_LENGTH = 160;

@Injectable()
export class MailSyncService {
  private readonly logger = new Logger(MailSyncService.name);
  private running = false;

  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    @Inject(MAIL_CREDENTIALS_STORE)
    private readonly credentialsStore: MailCredentialsStore,
    @Inject(MAILBOX_CONNECTOR) private readonly connector: MailboxConnector,
  ) {}

  async getStatus(): Promise<MailStatus> {
    const config = getMailConfig();
    const credentials = await this.credentialsStore.get();
    const rows = await this.db.select().from(syncState);

    return {
      address: credentials?.address ?? null,
      credentialsConfigured: Boolean(credentials),
      folders: config.folders,
      since: config.sinceRaw,
      syncStates: rows.map((row) => ({
        folder: row.folder,
        lastUid: row.lastUid,
        lastSyncAt: row.lastSyncAt ?? null,
      })),
    };
  }

  async listEmails(options?: {
    limit?: number;
    offset?: number;
    screenResult?: ScreenResult;
  }): Promise<EmailListResponse> {
    const limit = clampInt(options?.limit, 50, 1, 200);
    const offset = clampInt(options?.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const whereClause = options?.screenResult
      ? eq(email.screenResult, options.screenResult)
      : undefined;

    const [countRow] = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(email)
      .where(whereClause);
    const rows = await this.db
      .select()
      .from(email)
      .where(whereClause)
      .orderBy(desc(email.receivedAt))
      .limit(limit)
      .offset(offset);

    return {
      total: Number(countRow?.value ?? 0),
      items: rows.map((row) => this.toListItem(row)),
    };
  }

  async getEmail(id: string): Promise<EmailDetail | null> {
    const rows = await this.db.select().from(email).where(eq(email.id, id)).limit(1);
    const row = rows[0];
    if (!row) {
      return null;
    }

    const attachments = await this.db
      .select()
      .from(attachment)
      .where(eq(attachment.emailId, id));

    return {
      ...this.toListItem(row),
      bodyText: row.bodyText,
      bodyHtmlPath: row.bodyHtmlPath,
      rawPath: row.rawPath,
      inReplyTo: row.inReplyTo,
      referencesHeader: row.referencesHeader,
      reviewStatus: row.reviewStatus as EmailDetail['reviewStatus'],
      attachments: attachments.map((item) => ({
        id: item.id,
        emailId: item.emailId,
        filename: item.filename,
        path: item.path,
        size: item.size,
        mime: item.mime,
      })),
    };
  }

  async sync(): Promise<MailSyncResult> {
    if (this.running) {
      throw new ServiceUnavailableException('同步正在进行中');
    }

    const credentials = await this.credentialsStore.get();
    if (!credentials) {
      throw new ServiceUnavailableException(
        '未配置邮箱授权码。请先运行 pnpm --filter @job-harvester/server mail:set-credentials',
      );
    }

    this.running = true;
    const config = getMailConfig();
    const result: MailSyncResult = {
      scannedFolders: [],
      fetched: 0,
      inserted: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    let session: MailboxSession | undefined;
    try {
      session = await this.connector.connect(credentials);
      await session.sendId();

      const available = await session.listFolders();
      const folders = matchConfiguredFolders(available, config.folders);
      result.scannedFolders = folders;
      this.logger.log(`将扫描的文件夹：${folders.join(' | ')}`);
      if (!folders.some((folder) => folder.includes('订阅邮件'))) {
        this.logger.warn('扫描列表中未包含「订阅邮件」，招聘邮件可能被漏掉');
      }

      for (const folder of folders) {
        await this.syncFolder(session, folder, config.since, config.dataDir, result);
      }

      return result;
    } finally {
      this.running = false;
      if (session) {
        await session.close().catch((error: unknown) => {
          this.logger.warn(
            `关闭 IMAP 连接失败：${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }
    }
  }

  private async syncFolder(
    session: MailboxSession,
    folder: string,
    since: Date,
    dataDir: string,
    result: MailSyncResult,
  ): Promise<void> {
    const state = await this.getFolderState(folder);
    this.logger.log(`开始同步 ${folder}，lastUid=${state.lastUid}`);

    try {
      for await (const message of session.fetchMessages(folder, {
        since,
        afterUid: state.lastUid,
      })) {
        result.fetched += 1;
        try {
          const outcome = await this.persistMessage(
            folder,
            message.source,
            dataDir,
            message.internalDate,
          );
          if (outcome === 'inserted') {
            result.inserted += 1;
          } else {
            result.skipped += 1;
          }
        } catch (error) {
          result.failed += 1;
          const messageText =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `解析/入库失败 folder=${folder} uid=${message.uid}：${messageText}`,
          );
          result.errors.push({
            folder,
            uid: message.uid,
            message: messageText,
          });
        }

        await this.saveFolderState(folder, {
          lastUid: message.uid,
          lastSyncAt: state.lastSyncAt,
        });
        state.lastUid = message.uid;
      }

      await this.saveFolderState(folder, {
        lastUid: state.lastUid,
        lastSyncAt: new Date(),
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      this.logger.error(`文件夹 ${folder} 同步中断：${messageText}`);
      result.errors.push({ folder, message: messageText });
    }
  }

  private async persistMessage(
    folder: string,
    source: Buffer,
    dataDir: string,
    internalDate?: Date,
  ): Promise<'inserted' | 'skipped'> {
    const parsed = await parseMailSource(source, { internalDate });
    const existing = await this.db
      .select({ id: email.id })
      .from(email)
      .where(eq(email.messageId, parsed.messageId))
      .limit(1);
    if (existing[0]) {
      return 'skipped';
    }

    const id = uuidv4();
    const files = writeMailFiles({
      dataDir,
      emailId: id,
      rawSource: source,
      bodyHtml: parsed.bodyHtml,
      attachments: parsed.attachments,
    });
    const now = new Date();

    try {
      await this.db.insert(email).values({
        id,
        messageId: parsed.messageId,
        folder,
        fromName: parsed.fromName,
        fromAddress: parsed.fromAddress,
        subject: parsed.subject,
        receivedAt: parsed.receivedAt,
        bodyText: parsed.bodyText,
        bodyHtmlPath: files.bodyHtmlPath,
        rawPath: files.rawPath,
        hasAttachment: files.attachments.length > 0,
        inReplyTo: parsed.inReplyTo,
        referencesHeader: parsed.referencesHeader,
        screenResult: 'SUSPECT',
        parseStatus: 'PENDING',
        reviewStatus: 'NEEDS_REVIEW',
        createdAt: now,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return 'skipped';
      }
      throw error;
    }

    if (files.attachments.length > 0) {
      await this.db.insert(attachment).values(
        files.attachments.map((item) => ({
          id: uuidv4(),
          emailId: id,
          filename: item.filename,
          path: item.path,
          size: item.size,
          mime: item.mime,
        })),
      );
    }

    return 'inserted';
  }

  private async getFolderState(folder: string): Promise<{
    id: string;
    lastUid: number;
    lastSyncAt: Date | null;
  }> {
    const rows = await this.db
      .select()
      .from(syncState)
      .where(eq(syncState.folder, folder))
      .limit(1);
    const row = rows[0];
    if (row) {
      return {
        id: row.id,
        lastUid: row.lastUid,
        lastSyncAt: row.lastSyncAt ?? null,
      };
    }

    const created = {
      id: uuidv4(),
      folder,
      lastUid: 0,
      lastSyncAt: null as Date | null,
    };
    await this.db.insert(syncState).values(created);
    return created;
  }

  private async saveFolderState(
    folder: string,
    values: { lastUid: number; lastSyncAt: Date | null },
  ): Promise<void> {
    const rows = await this.db
      .select({ id: syncState.id })
      .from(syncState)
      .where(eq(syncState.folder, folder))
      .limit(1);
    const id = rows[0]?.id;
    if (!id) {
      await this.db.insert(syncState).values({
        id: uuidv4(),
        folder,
        lastUid: values.lastUid,
        lastSyncAt: values.lastSyncAt,
      });
      return;
    }

    await this.db
      .update(syncState)
      .set({
        lastUid: values.lastUid,
        lastSyncAt: values.lastSyncAt,
      })
      .where(eq(syncState.id, id));
  }

  private toListItem(row: typeof email.$inferSelect): EmailListItem {
    return {
      id: row.id,
      messageId: row.messageId,
      folder: row.folder,
      fromName: row.fromName,
      fromAddress: row.fromAddress,
      subject: row.subject,
      receivedAt: row.receivedAt,
      bodyPreview: previewText(row.bodyText),
      hasAttachment: Boolean(row.hasAttachment),
      screenResult: row.screenResult as EmailListItem['screenResult'],
      parseStatus: row.parseStatus as EmailListItem['parseStatus'],
    };
  }
}

function previewText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= BODY_PREVIEW_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, BODY_PREVIEW_LENGTH)}…`;
}

function clampInt(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = 'code' in error ? String(error.code) : '';
  const message = 'message' in error ? String(error.message) : '';
  return (
    code.includes('CONSTRAINT') ||
    message.includes('UNIQUE') ||
    message.includes('unique')
  );
}
