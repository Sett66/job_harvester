import { Injectable, Logger } from '@nestjs/common';
import type { ImapFlow } from 'imapflow';
import { getMailConfig } from '../../config/mail.config';
import type { MailCredentials } from './credentials';

export const MAILBOX_CONNECTOR = Symbol('MAILBOX_CONNECTOR');

export const IMAP_CLIENT_ID = {
  name: 'job-harvester',
  version: '1.0.0',
  vendor: 'job-harvester',
};

export type RawImapMessage = {
  uid: number;
  folder: string;
  source: Buffer;
  internalDate?: Date;
};

export type MailboxSession = {
  sendId(): Promise<void>;
  listFolders(): Promise<string[]>;
  fetchMessages(
    folder: string,
    options: { since: Date; afterUid: number },
  ): AsyncIterable<RawImapMessage>;
  close(): Promise<void>;
};

export type MailboxConnector = {
  connect(credentials: MailCredentials): Promise<MailboxSession>;
};

export function matchConfiguredFolders(
  available: string[],
  configured: string[],
): string[] {
  const selected: string[] = [];

  for (const wanted of configured) {
    const exact = available.find(
      (item) => item === wanted || item.toLowerCase() === wanted.toLowerCase(),
    );
    const partial = available.find((item) => item.includes(wanted));
    const found = exact ?? partial;
    if (found && !selected.includes(found)) {
      selected.push(found);
    }
  }

  return selected.length > 0 ? selected : [...configured];
}

@Injectable()
export class ImapflowMailboxConnector implements MailboxConnector {
  private readonly logger = new Logger(ImapflowMailboxConnector.name);

  async connect(credentials: MailCredentials): Promise<MailboxSession> {
    const config = getMailConfig();
    const { ImapFlow } = await import('imapflow');
    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: true,
      auth: {
        user: credentials.address,
        pass: credentials.authCode,
      },
      logger: false,
      disableAutoIdle: true,
      clientInfo: IMAP_CLIENT_ID,
    });

    await client.connect();
    return new ImapflowMailboxSession(client, this.logger);
  }
}

type ImapFlowInternals = ImapFlow & {
  capabilities: Map<string, boolean>;
  run(command: string, ...args: unknown[]): Promise<unknown>;
};

class ImapflowMailboxSession implements MailboxSession {
  constructor(
    private readonly client: ImapFlow,
    private readonly logger: Logger,
  ) {}

  async sendId(): Promise<void> {
    const client = this.client as ImapFlowInternals;
    // QQ 邮箱可能不在 CAPABILITY 里声明 ID，imapflow 会因此跳过该命令并随后报 Unsafe Login
    if (!client.capabilities.has('ID')) {
      client.capabilities.set('ID', true);
    }
    await client.run('ID', IMAP_CLIENT_ID);
    this.logger.log(
      `已发送 IMAP ID 命令：name=${IMAP_CLIENT_ID.name} version=${IMAP_CLIENT_ID.version}`,
    );
  }

  async listFolders(): Promise<string[]> {
    const boxes = await this.client.list();
    const paths = boxes
      .map((box) => box.path)
      .filter((item): item is string => Boolean(item));
    this.logger.log(`服务器文件夹列表：${paths.join(' | ') || '(空)'}`);
    return paths;
  }

  async *fetchMessages(
    folder: string,
    options: { since: Date; afterUid: number },
  ): AsyncIterable<RawImapMessage> {
    const lock = await this.client.getMailboxLock(folder);
    try {
      const searched = await this.client.search(
        { since: options.since },
        { uid: true },
      );
      const uids = (Array.isArray(searched) ? searched : [])
        .filter((uid) => uid > options.afterUid)
        .sort((a, b) => a - b);

      this.logger.log(
        `文件夹 ${folder}：since=${options.since.toISOString().slice(0, 10)} afterUid=${options.afterUid} 待拉取 ${uids.length} 封`,
      );

      if (uids.length === 0) {
        return;
      }

      for await (const message of this.client.fetch(
        uids,
        { uid: true, source: true, internalDate: true },
        { uid: true },
      )) {
        const source = toBuffer(message.source);
        if (!source || typeof message.uid !== 'number') {
          continue;
        }
        yield {
          uid: message.uid,
          folder,
          source,
          internalDate: toDate(message.internalDate),
        };
      }
    } finally {
      lock.release();
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.logout();
    } catch {
      this.client.close();
    }
  }
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return undefined;
}

function toBuffer(source: unknown): Buffer | null {
  if (!source) {
    return null;
  }
  if (Buffer.isBuffer(source)) {
    return source;
  }
  if (source instanceof Uint8Array) {
    return Buffer.from(source);
  }
  if (typeof source === 'string') {
    return Buffer.from(source);
  }
  return null;
}
