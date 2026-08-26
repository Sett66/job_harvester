import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/database.provider';
import {
  application,
  company,
  companyAlias,
  email,
  emailExtraction,
  event,
} from '../src/db/schema';
import { ExtractionService } from '../src/modules/extraction/extraction.service';
import {
  LlmService,
  type LlmChatClient,
} from '../src/modules/llm/llm.service';
import { ApplicationsService } from '../src/modules/applications/applications.service';
import { ApplicationStateService } from '../src/modules/applications/application-state.service';
import { CompaniesService } from '../src/modules/companies/companies.service';
import { EventsService } from '../src/modules/events/events.service';
import { loadScreenRules } from '../src/modules/mail/screen-rules';
import { countEvents } from '../src/modules/extraction/merge-application';
import type { MailExtractionOutput } from '@job-harvester/shared';

function buildExtractionService(
  db: ReturnType<typeof createDatabase>,
  llmPayload: Partial<MailExtractionOutput> &
    Pick<
      MailExtractionOutput,
      'companyName' | 'batch' | 'eventType' | 'occurredAt' | 'confidence'
    >,
) {
  const companiesService = new CompaniesService(db as never);
  const applicationStateService = new ApplicationStateService(db as never);
  const eventsService = new EventsService(db as never, applicationStateService);
  const applicationsService = new ApplicationsService(db as never, companiesService);
  const llmClient: LlmChatClient = {
    complete: async () => {
      const body: Record<string, unknown> = {
        companyName: llmPayload.companyName,
        batch: llmPayload.batch,
        eventType: llmPayload.eventType,
        occurredAt:
          llmPayload.occurredAt instanceof Date
            ? llmPayload.occurredAt.toISOString()
            : llmPayload.occurredAt,
        confidence: llmPayload.confidence,
      };
      if (llmPayload.businessUnit) {
        body.businessUnit = llmPayload.businessUnit;
      }
      if (llmPayload.position) {
        body.position = llmPayload.position;
      }
      if (llmPayload.deadlineAt) {
        body.deadlineAt =
          llmPayload.deadlineAt instanceof Date
            ? llmPayload.deadlineAt.toISOString()
            : llmPayload.deadlineAt;
      }
      return {
        content: JSON.stringify(body),
        usage: { promptTokens: 10, completionTokens: 20 },
      };
    },
  };
  const llmService = new LlmService(llmClient);
  return new ExtractionService(
    db as never,
    llmService,
    companiesService,
    applicationsService,
    eventsService,
  );
}

async function seedEmail(
  db: ReturnType<typeof createDatabase>,
  input?: Partial<typeof email.$inferInsert>,
) {
  const now = new Date();
  const emailId = input?.id ?? uuidv4();
  await db.insert(email).values({
    id: emailId,
    messageId: input?.messageId ?? `<${emailId}@example.com>`,
    folder: 'INBOX',
    fromName: 'HR',
    fromAddress: input?.fromAddress ?? 'hr@bytedance.com',
    subject: input?.subject ?? '笔试通知',
    receivedAt: now,
    bodyText: input?.bodyText ?? '请于 3 月 29 日 24:00 前完成在线笔试',
    hasAttachment: false,
    screenResult: input?.screenResult ?? 'RELEVANT',
    parseStatus: 'PENDING',
    reviewStatus: 'NEEDS_REVIEW',
    createdAt: now,
    ...input,
  });
  return emailId;
}

describe('ExtractionService idempotency', () => {
  it('does not create duplicate events when reextract runs twice', async () => {
    const db = createDatabase(':memory:');
    const now = new Date();
    const companyId = uuidv4();
    const applicationId = uuidv4();
    const emailId = uuidv4();

    await db.insert(company).values({
      id: companyId,
      canonicalName: '字节跳动',
      createdAt: now,
    });
    await db.insert(application).values({
      id: applicationId,
      companyId,
      businessUnit: '豆包',
      batch: '2026秋招',
      stage: 'APPLIED',
      currentRound: 0,
      lastEventAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await seedEmail(db, { id: emailId, messageId: '<test-message-id>' });

    const extractionService = buildExtractionService(db, {
      companyName: '字节跳动',
      batch: '2026秋招',
      businessUnit: '豆包',
      eventType: 'EXAM_INVITE',
      occurredAt: now,
      deadlineAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      confidence: 0.92,
    });
    await extractionService.extractEmail(emailId);
    const afterFirst = await countEvents(db as never);

    await extractionService.extractEmail(emailId);
    const afterSecond = await countEvents(db as never);

    expect(afterFirst).toBeGreaterThan(0);
    expect(afterSecond).toBe(afterFirst);

    const events = await db.select().from(event);
    expect(events.filter((row) => row.emailId === emailId)).toHaveLength(1);
  });
});

describe('ExtractionService routing', () => {
  it('auto confirms high-confidence emails with a resolved application', async () => {
    const db = createDatabase(':memory:');
    const now = new Date();
    const companyId = uuidv4();
    const applicationId = uuidv4();
    const emailId = await seedEmail(db);

    await db.insert(company).values({
      id: companyId,
      canonicalName: '字节跳动',
      createdAt: now,
    });
    await db.insert(application).values({
      id: applicationId,
      companyId,
      businessUnit: '豆包',
      batch: '2026秋招',
      stage: 'APPLIED',
      currentRound: 0,
      lastEventAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const extractionService = buildExtractionService(db, {
      companyName: '字节跳动',
      batch: '2026秋招',
      businessUnit: '豆包',
      eventType: 'EXAM_INVITE',
      occurredAt: now,
      deadlineAt: new Date('2026-03-29T16:00:00.000Z'),
      confidence: 0.95,
    });

    const outcome = await extractionService.extractEmail(emailId);
    expect(outcome).toBe('auto');

    const emailRows = await db
      .select()
      .from(email)
      .where(eq(email.id, emailId));
    expect(emailRows[0]?.reviewStatus).toBe('AUTO');

    const events = await db.select().from(event);
    expect(events).toHaveLength(1);
    expect(events[0]?.deadlineAt?.toISOString()).toBe('2026-03-29T16:00:00.000Z');
  });

  it('queues low-confidence extractions instead of auto confirming', async () => {
    const db = createDatabase(':memory:');
    const now = new Date();
    const companyId = uuidv4();
    const applicationId = uuidv4();
    const emailId = await seedEmail(db);

    await db.insert(company).values({
      id: companyId,
      canonicalName: '字节跳动',
      createdAt: now,
    });
    await db.insert(application).values({
      id: applicationId,
      companyId,
      businessUnit: '豆包',
      batch: '2026秋招',
      stage: 'APPLIED',
      currentRound: 0,
      lastEventAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const extractionService = buildExtractionService(db, {
      companyName: '字节跳动',
      batch: '2026秋招',
      businessUnit: '豆包',
      eventType: 'EXAM_INVITE',
      occurredAt: now,
      confidence: 0.55,
    });

    const outcome = await extractionService.extractEmail(emailId);
    expect(outcome).toBe('queued');

    const emailRows = await db.select().from(email);
    expect(emailRows[0]?.reviewStatus).toBe('NEEDS_REVIEW');
    expect(await countEvents(db as never)).toBe(0);

    const queue = await extractionService.getReviewQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.emailId).toBe(emailId);
  });

  it('queues high-confidence exam invites missing deadline instead of aborting batch', async () => {
    const db = createDatabase(':memory:');
    const now = new Date();
    const companyId = uuidv4();
    const applicationId = uuidv4();
    const emailId = await seedEmail(db);

    await db.insert(company).values({
      id: companyId,
      canonicalName: '字节跳动',
      createdAt: now,
    });
    await db.insert(application).values({
      id: applicationId,
      companyId,
      businessUnit: '豆包',
      batch: '2026秋招',
      stage: 'APPLIED',
      currentRound: 0,
      lastEventAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const extractionService = buildExtractionService(db, {
      companyName: '字节跳动',
      batch: '2026秋招',
      businessUnit: '豆包',
      eventType: 'EXAM_INVITE',
      occurredAt: now,
      confidence: 0.95,
    });

    const outcome = await extractionService.extractEmail(emailId);
    expect(outcome).toBe('queued');
    expect(await countEvents(db as never)).toBe(0);

    const emailRows = await db.select().from(email).where(eq(email.id, emailId));
    expect(emailRows[0]?.reviewStatus).toBe('NEEDS_REVIEW');
  });

  it('queues high-confidence emails when application cannot be resolved', async () => {
    const db = createDatabase(':memory:');
    const now = new Date();
    const companyId = uuidv4();
    const emailId = await seedEmail(db);

    await db.insert(company).values({
      id: companyId,
      canonicalName: '腾讯',
      createdAt: now,
    });
    await db.insert(application).values({
      id: uuidv4(),
      companyId,
      businessUnit: '微信',
      batch: '2026秋招',
      stage: 'APPLIED',
      currentRound: 0,
      lastEventAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(application).values({
      id: uuidv4(),
      companyId,
      businessUnit: '元宝',
      batch: '2026秋招',
      stage: 'APPLIED',
      currentRound: 0,
      lastEventAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const extractionService = buildExtractionService(db, {
      companyName: '腾讯',
      batch: '2026秋招',
      eventType: 'INTERVIEW_SCHEDULED',
      occurredAt: now,
      confidence: 0.96,
    });

    const outcome = await extractionService.extractEmail(emailId);
    expect(outcome).toBe('queued');
    expect(await countEvents(db as never)).toBe(0);

    const extractions = await db.select().from(emailExtraction);
    expect(extractions[0]?.matchMethod).toBe('NONE');
  });

  it('does not merge extracted summer internship emails onto excel autumn apps', async () => {
    const db = createDatabase(':memory:');
    const now = new Date();
    const companyId = uuidv4();
    const applicationId = uuidv4();
    const emailId = await seedEmail(db);

    await db.insert(company).values({
      id: companyId,
      canonicalName: '字节跳动',
      createdAt: now,
    });
    await db.insert(application).values({
      id: applicationId,
      companyId,
      businessUnit: '豆包',
      batch: '2026春招',
      stage: 'APPLIED',
      currentRound: 0,
      lastEventAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const extractionService = buildExtractionService(db, {
      companyName: '字节跳动',
      batch: '2027暑期实习',
      businessUnit: '豆包',
      eventType: 'EXAM_INVITE',
      occurredAt: now,
      deadlineAt: new Date('2026-07-01T16:00:00.000Z'),
      confidence: 0.95,
    });

    const outcome = await extractionService.extractEmail(emailId);
    expect(outcome).toBe('queued');

    const extractions = await db.select().from(emailExtraction);
    expect(extractions[0]?.matchMethod).toBe('NONE');
    expect(extractions[0]?.batch).toBe('2027暑期实习');
    expect(await countEvents(db as never)).toBe(0);
  });
});

describe('ExtractionService confirmReview feedback', () => {
  let rulesPath: string;
  const originalRulesPath = process.env.SCREEN_RULES_PATH;

  beforeEach(() => {
    rulesPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'jh-extract-')),
      'screen-rules.json',
    );
    process.env.SCREEN_RULES_PATH = rulesPath;
    fs.writeFileSync(
      rulesPath,
      `${JSON.stringify(
        {
          whitelistDomains: [],
          blacklistDomains: [],
          excludeKeywords: [],
          subjectKeywords: [],
          bodyRelevantKeywords: [],
          bodyKeywords: [],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  });

  afterEach(() => {
    if (originalRulesPath === undefined) {
      delete process.env.SCREEN_RULES_PATH;
    } else {
      process.env.SCREEN_RULES_PATH = originalRulesPath;
    }
    fs.rmSync(path.dirname(rulesPath), { recursive: true, force: true });
  });

  it('creates company alias and whitelist domain on confirm', async () => {
    const db = createDatabase(':memory:');
    const now = new Date();
    const companyId = uuidv4();
    const applicationId = uuidv4();
    const emailId = await seedEmail(db, {
      fromAddress: 'campus@newcorp.com',
    });

    await db.insert(company).values({
      id: companyId,
      canonicalName: '字节跳动',
      createdAt: now,
    });
    await db.insert(application).values({
      id: applicationId,
      companyId,
      businessUnit: '豆包',
      batch: '2026秋招',
      stage: 'APPLIED',
      currentRound: 0,
      lastEventAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const extractionService = buildExtractionService(db, {
      companyName: '字节 - 豆包',
      batch: '2027暑期实习',
      businessUnit: '豆包',
      eventType: 'EXAM_INVITE',
      occurredAt: now,
      confidence: 0.4,
    });
    await extractionService.extractEmail(emailId);

    const queue = await extractionService.getReviewQueue();
    await extractionService.confirmReview(queue[0]!.extractionId, {
      applicationId,
      eventType: 'EXAM_INVITE',
      occurredAt: now,
      deadlineAt: new Date('2026-03-29T16:00:00.000Z'),
      addSenderDomainToWhitelist: true,
    });

    const aliases = await db.select().from(companyAlias);
    expect(aliases).toHaveLength(1);
    expect(aliases[0]?.alias).toBe('字节 - 豆包');

    const rules = loadScreenRules();
    expect(rules.whitelistDomains).toContain('newcorp.com');
    expect(await countEvents(db as never)).toBe(1);
  });

  it('uses confirmed alias on subsequent extraction', async () => {
    const db = createDatabase(':memory:');
    const now = new Date();
    const companyId = uuidv4();
    const applicationId = uuidv4();

    await db.insert(company).values({
      id: companyId,
      canonicalName: '字节跳动',
      createdAt: now,
    });
    await db.insert(application).values({
      id: applicationId,
      companyId,
      businessUnit: '豆包',
      batch: '2027暑期实习',
      stage: 'APPLIED',
      currentRound: 0,
      lastEventAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(companyAlias).values({
      id: uuidv4(),
      companyId,
      alias: '字节-豆包',
      source: 'CONFIRMED',
    });

    const emailId = await seedEmail(db, {
      subject: '字节- 豆包 笔试通知',
    });

    const extractionService = buildExtractionService(db, {
      companyName: '字节- 豆包',
      batch: '2027暑期实习',
      businessUnit: '豆包',
      eventType: 'EXAM_INVITE',
      occurredAt: now,
      deadlineAt: new Date('2026-03-30T16:00:00.000Z'),
      confidence: 0.93,
    });

    const outcome = await extractionService.extractEmail(emailId);
    expect(outcome).toBe('auto');

    const events = await db.select().from(event);
    expect(events[0]?.applicationId).toBe(applicationId);
  });
});
