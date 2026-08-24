import { v4 as uuidv4 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/database.provider';
import { application, company, email, event } from '../src/db/schema';
import { ExtractionService } from '../src/modules/extraction/extraction.service';
import { LlmService } from '../src/modules/llm/llm.service';
import { ApplicationsService } from '../src/modules/applications/applications.service';
import { ApplicationStateService } from '../src/modules/applications/application-state.service';
import { CompaniesService } from '../src/modules/companies/companies.service';
import { EventsService } from '../src/modules/events/events.service';
import { countEvents } from '../src/modules/extraction/merge-application';

function buildExtractionService(db: ReturnType<typeof createDatabase>) {
  const companiesService = new CompaniesService(db as never);
  const applicationStateService = new ApplicationStateService(db as never);
  const eventsService = new EventsService(db as never, applicationStateService);
  const applicationsService = new ApplicationsService(db as never, companiesService);
  const llmService = new LlmService();
  return new ExtractionService(
    db as never,
    llmService,
    companiesService,
    applicationsService,
    eventsService,
  );
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
    await db.insert(email).values({
      id: emailId,
      messageId: '<test-message-id>',
      folder: 'INBOX',
      fromName: 'HR',
      fromAddress: 'hr@bytedance.com',
      subject: '字节跳动 - 豆包 笔试通知',
      receivedAt: now,
      bodyText: '请于 3 月 29 日 24:00 前完成在线笔试',
      hasAttachment: false,
      screenResult: 'RELEVANT',
      parseStatus: 'PENDING',
      reviewStatus: 'NEEDS_REVIEW',
      createdAt: now,
    });

    const extractionService = buildExtractionService(db);
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
