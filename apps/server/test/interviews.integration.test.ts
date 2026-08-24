import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DATABASE, createDatabase } from '../src/db/database.provider';

describe('Interviews API (integration)', () => {
  let app: NestFastifyApplication;
  let applicationId: string;
  let notesDir: string;

  beforeAll(async () => {
    notesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-notes-'));
    process.env.DATABASE_PATH = ':memory:';
    process.env.NOTES_DIR = notesDir;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE)
      .useFactory({
        factory: () => createDatabase(':memory:'),
      })
      .compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const companyResponse = await app.inject({
      method: 'POST',
      url: '/api/companies',
      payload: { canonicalName: '字节跳动' },
    });
    const companyId = companyResponse.json().id;

    const applicationResponse = await app.inject({
      method: 'POST',
      url: '/api/applications',
      payload: {
        companyId,
        businessUnit: '豆包',
        batch: '批次1',
      },
    });
    applicationId = applicationResponse.json().application.id;
  });

  afterAll(async () => {
    await app.close();
    delete process.env.DATABASE_PATH;
    delete process.env.NOTES_DIR;
    fs.rmSync(notesDir, { recursive: true, force: true });
  });

  it('structures colloquial debrief text into questions', async () => {
    const rawDump =
      '问了 MySQL 索引、Redis 缓存穿透、我项目那个消息队列为啥选 Kafka，第三个答崩了';

    const structure = await app.inject({
      method: 'POST',
      url: '/api/debrief/structure',
      payload: { applicationId, rawDump },
    });

    expect(structure.statusCode).toBe(200);
    expect(structure.json().questions.length).toBeGreaterThanOrEqual(2);
  });

  it('finalizes debrief with markdown on disk and questions in db', async () => {
    const rawDump =
      '问了 MySQL 索引、Redis 缓存穿透、我项目那个消息队列为啥选 Kafka，第三个答崩了';

    const structure = await app.inject({
      method: 'POST',
      url: '/api/debrief/structure',
      payload: { applicationId, rawDump },
    });
    const structured = structure.json();

    const finalize = await app.inject({
      method: 'POST',
      url: '/api/debrief/finalize',
      payload: {
        applicationId,
        rawDump,
        summary: structured.summary,
        questions: structured.questions,
      },
    });

    expect(finalize.statusCode).toBe(201);
    const result = finalize.json();
    expect(result.interviewNote.rawDump).toBe(rawDump);
    expect(fs.existsSync(result.interviewNote.mdPath)).toBe(true);
    expect(result.questions.length).toBeGreaterThan(0);

    const note = await app.inject({
      method: 'GET',
      url: `/api/interview-notes/${result.interviewNote.id}`,
    });
    expect(note.json().rawDump).toBe(rawDump);
  });

  it('limits probe rounds to at most 3', async () => {
    const probe = await app.inject({
      method: 'POST',
      url: '/api/debrief/probe',
      payload: {
        rawDump: '问了 Redis',
        questions: [{ text: 'Redis 缓存穿透怎么处理' }],
        messages: [
          { role: 'assistant', content: '你当时怎么答的？' },
          { role: 'user', content: '说了布隆过滤器' },
          { role: 'assistant', content: '还有呢？' },
          { role: 'user', content: '忘了' },
        ],
        round: 3,
      },
    });

    expect(probe.statusCode).toBe(200);
    expect(probe.json().shouldContinue).toBe(false);
  });

  it('updates question selfRating and status', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/questions',
    });
    const first = list.json()[0];
    expect(first).toBeTruthy();

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/questions/${first.id}`,
      payload: { selfRating: 2, status: 'WEAK' },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().selfRating).toBe(2);
    expect(updated.json().status).toBe('WEAK');
  });
});
