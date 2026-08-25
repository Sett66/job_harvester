import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/database.provider';
import { attachment, email, syncState } from '../src/db/schema';
import { MemoryCredentialsStore } from '../src/modules/mail/credentials';
import {
  matchConfiguredFolders,
  type MailboxConnector,
  type MailboxSession,
  type RawImapMessage,
} from '../src/modules/mail/imap.client';
import { sanitizeFilename } from '../src/modules/mail/mail-storage';
import { parseMailSource } from '../src/modules/mail/parse-mail';
import { MailSyncService } from '../src/modules/mail/sync.service';

const AUTH_CODE = 'SECRET-AUTH-CODE-XYZ';
const HTML_MARKER = '<!--JH-HTML-MARKER-->';

function buildEml(options: {
  messageId: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
  filename?: string;
  fileContent?: string;
}): Buffer {
  if (options.html || options.filename) {
    const html = options.html ?? `<p>${options.text}</p>`;
    const parts = [
      `From: ${options.from}`,
      `Subject: ${options.subject}`,
      `Message-ID: ${options.messageId}`,
      'Date: Mon, 02 Mar 2026 10:00:00 +0800',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="BOUND"',
      '',
      '--BOUND',
      'Content-Type: multipart/alternative; boundary="ALT"',
      '',
      '--ALT',
      'Content-Type: text/plain; charset=utf-8',
      '',
      options.text,
      '--ALT',
      'Content-Type: text/html; charset=utf-8',
      '',
      html,
      '--ALT--',
    ];
    if (options.filename && options.fileContent) {
      parts.push(
        '--BOUND',
        `Content-Type: application/pdf`,
        `Content-Disposition: attachment; filename="${options.filename}"`,
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(options.fileContent).toString('base64'),
      );
    }
    parts.push('--BOUND--', '');
    return Buffer.from(parts.join('\r\n'));
  }

  return Buffer.from(
    [
      `From: ${options.from}`,
      `Subject: ${options.subject}`,
      `Message-ID: ${options.messageId}`,
      'Date: Mon, 02 Mar 2026 10:00:00 +0800',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      options.text,
      '',
    ].join('\r\n'),
  );
}

class FakeSession implements MailboxSession {
  sendIdCalled = false;
  fetchAfterUid: Record<string, number> = {};

  constructor(
    private readonly folders: string[],
    private readonly messages: RawImapMessage[],
    private readonly throwOnUid?: number,
  ) {}

  async sendId(): Promise<void> {
    this.sendIdCalled = true;
  }

  async listFolders(): Promise<string[]> {
    return this.folders;
  }

  async *fetchMessages(
    folder: string,
    options: { since: Date; afterUid: number },
  ): AsyncIterable<RawImapMessage> {
    this.fetchAfterUid[folder] = options.afterUid;
    const ordered = this.messages
      .filter((item) => item.folder === folder && item.uid > options.afterUid)
      .sort((a, b) => a.uid - b.uid);
    for (const message of ordered) {
      if (this.throwOnUid === message.uid) {
        throw new Error('interrupted');
      }
      yield message;
    }
  }

  async close(): Promise<void> {}
}

class FakeConnector implements MailboxConnector {
  lastSession: FakeSession | null = null;
  connectCount = 0;

  constructor(
    private readonly folders: string[],
    private readonly messages: RawImapMessage[],
    private readonly throwOnUidForFirstConnect?: number,
  ) {}

  async connect(): Promise<MailboxSession> {
    this.connectCount += 1;
    const throwOnUid =
      this.connectCount === 1 ? this.throwOnUidForFirstConnect : undefined;
    this.lastSession = new FakeSession(this.folders, this.messages, throwOnUid);
    return this.lastSession;
  }
}

describe('MailSyncService', () => {
  const originalEnv = { ...process.env };
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-mail-'));
    process.env.DATA_DIR = dataDir;
    process.env.MAIL_FOLDERS = 'INBOX,订阅邮件,Junk';
    process.env.MAIL_SINCE = '2026-03-01';
  });

  afterEach(() => {
    restoreEnv('DATA_DIR');
    restoreEnv('MAIL_FOLDERS');
    restoreEnv('MAIL_SINCE');
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  function restoreEnv(key: 'DATA_DIR' | 'MAIL_FOLDERS' | 'MAIL_SINCE'): void {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }

  function createService(
    connector: MailboxConnector,
    authCode = AUTH_CODE,
  ): { service: MailSyncService; db: ReturnType<typeof createDatabase> } {
    const db = createDatabase(':memory:');
    const store = new MemoryCredentialsStore();
    const service = new MailSyncService(db, store, connector);
    void store.set({ address: 'name@qq.com', authCode });
    return { service, db };
  }

  it('sends the IMAP ID command and scans 订阅邮件 plus INBOX', async () => {
    const connector = new FakeConnector(
      ['INBOX', '订阅邮件', 'Junk'],
      [
        {
          uid: 1,
          folder: 'INBOX',
          source: buildEml({
            messageId: '<inbox-1@example.com>',
            from: 'HR <hr@example.com>',
            subject: 'INBOX 邮件',
            text: 'inbox body',
          }),
        },
        {
          uid: 1,
          folder: '订阅邮件',
          source: buildEml({
            messageId: '<sub-1@example.com>',
            from: 'System <sys@example.com>',
            subject: '订阅邮件里的通知',
            text: 'subscribe body',
          }),
        },
      ],
    );
    const { service } = createService(connector);
    const result = await service.sync();

    expect(connector.lastSession?.sendIdCalled).toBe(true);
    expect(result.scannedFolders).toEqual(
      expect.arrayContaining(['INBOX', '订阅邮件']),
    );
    expect(result.inserted).toBe(2);
  });

  it('does not insert duplicate records for the same messageId', async () => {
    const source = buildEml({
      messageId: '<dup@example.com>',
      from: 'HR <hr@example.com>',
      subject: '重复邮件',
      text: 'same mail',
    });
    const connector = new FakeConnector(
      ['INBOX', '订阅邮件'],
      [
        { uid: 11, folder: 'INBOX', source },
        { uid: 21, folder: '订阅邮件', source },
      ],
    );
    const { service, db } = createService(connector);

    const first = await service.sync();
    const second = await service.sync();
    const rows = await db.select().from(email);

    expect(first.inserted).toBe(1);
    expect(first.skipped).toBe(1);
    expect(rows).toHaveLength(1);
    expect(second.inserted).toBe(0);
  });

  it('continues when a single message fails to parse', async () => {
    const connector = new FakeConnector(
      ['INBOX'],
      [
        {
          uid: 1,
          folder: 'INBOX',
          source: buildEml({
            messageId: '<ok-1@example.com>',
            from: 'HR <hr@example.com>',
            subject: '正常 1',
            text: 'ok 1',
          }),
        },
        { uid: 2, folder: 'INBOX', source: Buffer.alloc(0) },
        {
          uid: 3,
          folder: 'INBOX',
          source: buildEml({
            messageId: '<ok-3@example.com>',
            from: 'HR <hr@example.com>',
            subject: '正常 3',
            text: 'ok 3',
          }),
        },
      ],
    );
    const { service, db } = createService(connector);
    const result = await service.sync();
    const rows = await db.select().from(email);
    const states = await db.select().from(syncState);

    expect(result.failed).toBe(1);
    expect(result.inserted).toBe(2);
    expect(rows).toHaveLength(2);
    expect(states[0]?.lastUid).toBe(3);
    expect(result.errors[0]?.uid).toBe(2);
  });

  it('resumes from lastUid after an interrupted sync', async () => {
    const messages: RawImapMessage[] = [
      {
        uid: 1,
        folder: 'INBOX',
        source: buildEml({
          messageId: '<r1@example.com>',
          from: 'HR <hr@example.com>',
          subject: '第一封',
          text: 'one',
        }),
      },
      {
        uid: 2,
        folder: 'INBOX',
        source: buildEml({
          messageId: '<r2@example.com>',
          from: 'HR <hr@example.com>',
          subject: '第二封',
          text: 'two',
        }),
      },
    ];
    const connector = new FakeConnector(['INBOX'], messages, 2);
    const { service, db } = createService(connector);

    await service.sync();
    const afterFirst = await db.select().from(email);
    const stateAfterFirst = await db.select().from(syncState);
    expect(afterFirst).toHaveLength(1);
    expect(stateAfterFirst[0]?.lastUid).toBe(1);

    const second = await service.sync();
    const afterSecond = await db.select().from(email);

    expect(connector.lastSession?.fetchAfterUid.INBOX).toBe(1);
    expect(second.inserted).toBe(1);
    expect(afterSecond).toHaveLength(2);
  });

  it('writes large HTML and attachments to disk and only stores paths in the database', async () => {
    const html = `<html><body>${HTML_MARKER}<p>请于 3 月 29 日完成笔试</p></body></html>`;
    const connector = new FakeConnector(
      ['INBOX'],
      [
        {
          uid: 8,
          folder: 'INBOX',
          source: buildEml({
            messageId: '<file@example.com>',
            from: 'HR <hr@example.com>',
            subject: '带附件的通知',
            text: '请查收附件',
            html,
            filename: 'exam.pdf',
            fileContent: 'pdf-bytes',
          }),
        },
      ],
    );
    const { service, db } = createService(connector);
    await service.sync();

    const [row] = await db.select().from(email);
    const files = await db.select().from(attachment);
    expect(row?.bodyHtmlPath).toBeTruthy();
    expect(row?.rawPath).toBeTruthy();
    expect(fs.existsSync(row?.bodyHtmlPath ?? '')).toBe(true);
    expect(fs.readFileSync(row?.bodyHtmlPath ?? '', 'utf8')).toContain(HTML_MARKER);
    expect(fs.existsSync(row?.rawPath ?? '')).toBe(true);
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toContain(`${path.sep}attachments${path.sep}`);
    expect(fs.existsSync(files[0]?.path ?? '')).toBe(true);

    const dumped = JSON.stringify({
      emails: await db.select().from(email),
      attachments: files,
    });
    expect(dumped).not.toContain(HTML_MARKER);
    expect(dumped).not.toContain(AUTH_CODE);
    expect(row?.bodyText).toContain('请查收附件');
  });

  it('does not persist the auth code into env or the database', async () => {
    const connector = new FakeConnector(
      ['INBOX'],
      [
        {
          uid: 1,
          folder: 'INBOX',
          source: buildEml({
            messageId: '<secret-check@example.com>',
            from: 'HR <hr@example.com>',
            subject: '凭据隔离',
            text: 'hello',
          }),
        },
      ],
    );
    const { service, db } = createService(connector);
    await service.sync();

    expect(JSON.stringify(process.env)).not.toContain(AUTH_CODE);
    expect(JSON.stringify(await db.select().from(email))).not.toContain(AUTH_CODE);
    expect(JSON.stringify(await db.select().from(syncState))).not.toContain(AUTH_CODE);
  });
});

describe('mail helpers', () => {
  it('matches 订阅邮件 from the available folder list', () => {
    expect(
      matchConfiguredFolders(
        ['INBOX', 'Junk', '订阅邮件', '其他文件夹'],
        ['INBOX', '订阅邮件', 'Junk'],
      ),
    ).toEqual(['INBOX', '订阅邮件', 'Junk']);
  });

  it('sanitizes unsafe attachment filenames', () => {
    expect(sanitizeFilename('a/b\\c:d.pdf')).toBe('a_b_c_d.pdf');
  });

  it('rejects empty mail source', async () => {
    await expect(parseMailSource(Buffer.alloc(0))).rejects.toThrow('邮件源码为空');
  });

  it('uses Received header when Date header is missing', async () => {
    const source = Buffer.from(
      [
        'Received: from mx.example.com by imap.qq.com; Thu, 02 Apr 2026 18:17:38 +0800',
        'From: HR <hr@example.com>',
        'Subject: 感谢您的应聘!',
        'Message-ID: <no-date-header@example.com>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        '',
        '正文',
        '',
      ].join('\r\n'),
    );

    const parsed = await parseMailSource(source);
    expect(parsed.receivedAt.toISOString()).toBe('2026-04-02T10:17:38.000Z');
  });
});
