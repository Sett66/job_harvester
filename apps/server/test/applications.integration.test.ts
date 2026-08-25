import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DATABASE, createDatabase } from '../src/db/database.provider';

describe('Applications API (integration)', () => {
  let app: NestFastifyApplication;
  let companyId: string;

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
    companyId = companyResponse.json().id;
  });

  afterAll(async () => {
    await app.close();
    delete process.env.DATABASE_PATH;
  });

  it('creates applications grouped by company and warns on duplicates', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/applications',
      payload: {
        companyId,
        businessUnit: '豆包',
        batch: '批次1',
        stage: 'APPLIED',
      },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().duplicateWarning).toBeNull();

    const second = await app.inject({
      method: 'POST',
      url: '/api/applications',
      payload: {
        companyId,
        businessUnit: '抖音搜索',
        batch: '批次1',
        stage: 'APPLIED',
      },
    });
    expect(second.statusCode).toBe(201);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/applications',
      payload: {
        companyId,
        businessUnit: '豆包',
        batch: '批次1',
        stage: 'APPLIED',
      },
    });
    expect(duplicate.statusCode).toBe(201);
    expect(duplicate.json().duplicateWarning).toContain('已存在相同投递');

    const grouped = await app.inject({
      method: 'GET',
      url: '/api/applications',
    });
    expect(grouped.statusCode).toBe(200);
    expect(grouped.json()).toEqual([
      expect.objectContaining({
        company: expect.objectContaining({ canonicalName: '字节跳动' }),
        applications: expect.arrayContaining([
          expect.objectContaining({ businessUnit: '豆包' }),
          expect.objectContaining({ businessUnit: '抖音搜索' }),
        ]),
      }),
    ]);
    expect(grouped.json()[0].applications).toHaveLength(3);
  });

  it('creates company on the fly and supports empty business unit', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/applications',
      payload: {
        companyName: '众安保险',
        batch: '秋招',
        stage: 'APPLIED',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().application.businessUnit).toBeNull();
  });

  it('updates and deletes an application', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/applications',
      payload: {
        companyName: '腾讯',
        businessUnit: '元宝',
        batch: '批次1',
        stage: 'INTERVIEW',
        ball: 'ME',
      },
    });
    const applicationId = created.json().application.id;

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/applications/${applicationId}`,
      payload: {
        stage: 'CLOSED',
        ball: null,
        outcome: 'ASSUMED_DEAD',
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().stage).toBe('CLOSED');
    expect(updated.json().outcome).toBe('ASSUMED_DEAD');

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/applications/${applicationId}`,
    });
    expect(deleted.statusCode).toBe(204);
  });

  it('keeps overdue ME records on the board but out of today todos', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(10, 0, 0, 0);

    const todayMorning = new Date();
    todayMorning.setHours(8, 0, 0, 0);

    const overdue = await app.inject({
      method: 'POST',
      url: '/api/applications',
      payload: {
        companyName: '逾期测司',
        businessUnit: '过期',
        batch: '春招',
        stage: 'INTERVIEW',
        ball: 'ME',
        nextDeadlineAt: yesterday.toISOString(),
      },
    });
    expect(overdue.statusCode).toBe(201);
    const overdueId = overdue.json().application.id;

    const dueToday = await app.inject({
      method: 'POST',
      url: '/api/applications',
      payload: {
        companyName: '今日测司',
        businessUnit: '今天',
        batch: '秋招',
        stage: 'ASSESSMENT',
        ball: 'ME',
        nextDeadlineAt: todayMorning.toISOString(),
      },
    });
    expect(dueToday.statusCode).toBe(201);
    const dueTodayId = dueToday.json().application.id;

    const noDeadline = await app.inject({
      method: 'POST',
      url: '/api/applications',
      payload: {
        companyName: '无截止测司',
        batch: '秋招',
        stage: 'INTERVIEW',
        ball: 'ME',
      },
    });
    expect(noDeadline.statusCode).toBe(201);
    const noDeadlineId = noDeadline.json().application.id;

    const today = await app.inject({
      method: 'GET',
      url: '/api/applications/today',
    });
    expect(today.statusCode).toBe(200);
    const todoIds = today.json().todos.map((item: { id: string }) => item.id);
    expect(todoIds).not.toContain(overdueId);
    expect(todoIds).toContain(dueTodayId);
    expect(todoIds).toContain(noDeadlineId);

    const board = await app.inject({
      method: 'GET',
      url: '/api/applications/board',
    });
    expect(board.statusCode).toBe(200);
    const meIds = board
      .json()
      .columns.find((column: { key: string }) => column.key === 'ME')
      .groups.flatMap((group: { applications: { id: string }[] }) =>
        group.applications.map((application: { id: string }) => application.id),
      );
    expect(meIds).toContain(overdueId);
    expect(meIds).toContain(dueTodayId);
  });

  it('orders grouped applications by last event time, not edit time', async () => {
    const older = await app.inject({
      method: 'POST',
      url: '/api/applications',
      payload: {
        companyName: '排序测司A',
        batch: '批次1',
        stage: 'APPLIED',
      },
    });
    expect(older.statusCode).toBe(201);
    const olderId = older.json().application.id;

    const newer = await app.inject({
      method: 'POST',
      url: '/api/applications',
      payload: {
        companyName: '排序测司B',
        batch: '批次1',
        stage: 'APPLIED',
      },
    });
    expect(newer.statusCode).toBe(201);
    const newerId = newer.json().application.id;

    const progress = await app.inject({
      method: 'POST',
      url: `/api/applications/${olderId}/events`,
      payload: {
        type: 'EXAM_INVITE',
        occurredAt: new Date().toISOString(),
        source: 'MANUAL',
        deadlineAt: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    expect(progress.statusCode).toBe(201);

    const grouped = await app.inject({
      method: 'GET',
      url: '/api/applications',
    });
    expect(grouped.statusCode).toBe(200);
    const ids = grouped
      .json()
      .flatMap((group: { applications: { id: string }[] }) =>
        group.applications.map((application) => application.id),
      );
    expect(ids.indexOf(olderId)).toBeLessThan(ids.indexOf(newerId));
  });

  it('supports manual company alias maintenance', async () => {
    const alias = await app.inject({
      method: 'POST',
      url: `/api/companies/${companyId}/aliases`,
      payload: { alias: '字节 - 豆包', source: 'MANUAL' },
    });
    expect(alias.statusCode).toBe(201);

    const list = await app.inject({
      method: 'GET',
      url: `/api/companies/${companyId}/aliases`,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([
      expect.objectContaining({ alias: '字节 - 豆包', source: 'MANUAL' }),
    ]);
  });
});
