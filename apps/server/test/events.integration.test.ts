import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DATABASE, createDatabase } from '../src/db/database.provider';

describe('Events API (integration)', () => {
  let app: NestFastifyApplication;
  let applicationId: string;

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';

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
  });

  it('updates application state when events are added', async () => {
    const invite = await app.inject({
      method: 'POST',
      url: `/api/applications/${applicationId}/events`,
      payload: {
        type: 'EXAM_INVITE',
        occurredAt: '2026-03-20T10:00:00.000Z',
        source: 'MANUAL',
        deadlineAt: '2026-03-29T23:59:59.000Z',
      },
    });
    expect(invite.statusCode).toBe(201);
    expect(invite.json().application.stage).toBe('WRITTEN_EXAM');
    expect(invite.json().application.ball).toBe('ME');

    const done = await app.inject({
      method: 'POST',
      url: `/api/applications/${applicationId}/events`,
      payload: {
        type: 'EXAM_DONE',
        occurredAt: '2026-03-25T10:00:00.000Z',
        source: 'MANUAL',
      },
    });
    expect(done.json().application.ball).toBe('THEM');
    expect(done.json().application.nextDeadlineAt).toBeNull();
  });

  it('keeps state unchanged for NOTE and recomputes after delete', async () => {
    const companyResponse = await app.inject({
      method: 'POST',
      url: '/api/companies',
      payload: { canonicalName: '众安保险' },
    });
    const applicationResponse = await app.inject({
      method: 'POST',
      url: '/api/applications',
      payload: {
        companyId: companyResponse.json().id,
        batch: '秋招',
      },
    });
    const isolatedApplicationId = applicationResponse.json().application.id;

    const apply = await app.inject({
      method: 'POST',
      url: `/api/applications/${isolatedApplicationId}/events`,
      payload: {
        type: 'APPLY',
        occurredAt: '2026-03-01T10:00:00.000Z',
        source: 'MANUAL',
      },
    });
    expect(apply.json().application.stage).toBe('APPLIED');

    const invite = await app.inject({
      method: 'POST',
      url: `/api/applications/${isolatedApplicationId}/events`,
      payload: {
        type: 'EXAM_INVITE',
        occurredAt: '2026-03-20T10:00:00.000Z',
        source: 'MANUAL',
        deadlineAt: '2026-03-29T23:59:59.000Z',
      },
    });
    const inviteId = invite.json().event.id;

    const note = await app.inject({
      method: 'POST',
      url: `/api/applications/${isolatedApplicationId}/events`,
      payload: {
        type: 'NOTE',
        occurredAt: '2026-03-21T10:00:00.000Z',
        source: 'MANUAL',
        rawText: '简历没过，应该是还在 cd',
      },
    });
    expect(note.json().application.stage).toBe('WRITTEN_EXAM');

    await app.inject({
      method: 'DELETE',
      url: `/api/applications/${isolatedApplicationId}/events/${inviteId}`,
    });

    const afterDelete = await app.inject({
      method: 'GET',
      url: `/api/applications/${isolatedApplicationId}`,
    });
    expect(afterDelete.json().stage).toBe('APPLIED');
    expect(afterDelete.json().ball).toBe('THEM');
  });
});
