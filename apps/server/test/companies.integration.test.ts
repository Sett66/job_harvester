import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DATABASE } from '../src/db/database.provider';
import { createDatabase } from '../src/db/database.provider';

describe('Companies API (integration)', () => {
  let app: NestFastifyApplication;

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
  });

  afterAll(async () => {
    await app.close();
    delete process.env.DATABASE_PATH;
  });

  it('POST then GET returns the created company', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/companies',
      payload: {
        canonicalName: '字节跳动',
        industry: '互联网',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created.canonicalName).toBe('字节跳动');

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/companies',
    });

    expect(listResponse.statusCode).toBe(200);
    const companies = listResponse.json();
    expect(companies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          canonicalName: '字节跳动',
          industry: '互联网',
        }),
      ]),
    );
  });
});
