import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DATABASE, createDatabase } from '../src/db/database.provider';
import {
  MAIL_CREDENTIALS_STORE,
  MemoryCredentialsStore,
} from '../src/modules/mail/credentials';
import {
  MAILBOX_CONNECTOR,
  type MailboxConnector,
  type MailboxSession,
  type RawImapMessage,
} from '../src/modules/mail/imap.client';

function buildPlainEml(): Buffer {
  return Buffer.from(
    [
      'From: HR <hr@example.com>',
      'Subject: 接口同步测试',
      'Message-ID: <api-sync@example.com>',
      'Date: Mon, 02 Mar 2026 10:00:00 +0800',
      'Content-Type: text/plain; charset=utf-8',
      '',
      '正文内容',
      '',
    ].join('\r\n'),
  );
}

class ApiFakeSession implements MailboxSession {
  constructor(private readonly messages: RawImapMessage[]) {}
  async sendId(): Promise<void> {}
  async listFolders(): Promise<string[]> {
    return ['INBOX', '订阅邮件'];
  }
  async *fetchMessages(
    folder: string,
    options: { since: Date; afterUid: number },
  ): AsyncIterable<RawImapMessage> {
    for (const message of this.messages) {
      if (message.folder === folder && message.uid > options.afterUid) {
        yield message;
      }
    }
  }
  async close(): Promise<void> {}
}

describe('Mails API (integration)', () => {
  let app: NestFastifyApplication;
  let dataDir: string;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-mail-api-'));
    process.env.DATABASE_PATH = ':memory:';
    process.env.DATA_DIR = dataDir;
    process.env.MAIL_FOLDERS = 'INBOX,订阅邮件';

    const store = new MemoryCredentialsStore();
    await store.set({ address: 'name@qq.com', authCode: 'not-in-db' });
    const connector: MailboxConnector = {
      connect: async () =>
        new ApiFakeSession([
          { uid: 3, folder: 'INBOX', source: buildPlainEml() },
        ]),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE)
      .useFactory({
        factory: () => createDatabase(':memory:'),
      })
      .overrideProvider(MAIL_CREDENTIALS_STORE)
      .useValue(store)
      .overrideProvider(MAILBOX_CONNECTOR)
      .useValue(connector)
      .compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    process.env.DATABASE_PATH = originalEnv.DATABASE_PATH;
    process.env.DATA_DIR = originalEnv.DATA_DIR;
    process.env.MAIL_FOLDERS = originalEnv.MAIL_FOLDERS;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('syncs mail then lists sender, subject, time and body', async () => {
    const syncResponse = await app.inject({
      method: 'POST',
      url: '/api/mails/sync',
    });
    expect(syncResponse.statusCode).toBe(200);
    const syncBody = syncResponse.json();
    expect(syncBody.scannedFolders).toEqual(
      expect.arrayContaining(['INBOX', '订阅邮件']),
    );
    expect(syncBody.inserted).toBe(1);

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/mails',
    });
    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json();
    expect(listBody.total).toBe(1);
    expect(listBody.items[0]).toEqual(
      expect.objectContaining({
        subject: '接口同步测试',
        fromAddress: 'hr@example.com',
      }),
    );

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/mails/${listBody.items[0].id}`,
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toEqual(
      expect.objectContaining({
        subject: '接口同步测试',
        bodyText: expect.stringContaining('正文内容'),
      }),
    );
  });
});
