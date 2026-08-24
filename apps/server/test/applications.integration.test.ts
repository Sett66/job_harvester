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
