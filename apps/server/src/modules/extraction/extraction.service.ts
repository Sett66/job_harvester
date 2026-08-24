import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  confirmReviewSchema,
  mailExtractionOutputSchema,
  type ConfirmReviewInput,
  type MatchMethod,
  type ReviewQueueItem,
} from '@job-harvester/shared';
import { and, asc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE, type AppDatabase } from '../../db/database.provider';
import { application, email, emailExtraction, event } from '../../db/schema';
import { ApplicationsService } from '../applications/applications.service';
import { CompaniesService } from '../companies/companies.service';
import { EventsService } from '../events/events.service';
import { LlmService } from '../llm/llm.service';
import {
  EXTRACT_MAIL_PROMPT_NAME,
  EXTRACT_MAIL_SYSTEM,
  buildExtractMailUserPrompt,
} from '../llm/prompts/extract-mail';
import {
  addWhitelistDomain,
  extractDomainFromAddress,
} from '../mail/screen-rules';
import { matchCompanyByAlias } from './alias-match';
import {
  confidenceFromInt,
  confidenceToInt,
  findEmailsForExtraction,
  hasExistingEmailEvent,
  resolveApplicationForExtraction,
  shouldAutoConfirm,
} from './merge-application';

export type ExtractionBatchResult = {
  processed: number;
  auto: number;
  queued: number;
  failed: number;
  skipped: number;
};

@Injectable()
export class ExtractionService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly llmService: LlmService,
    private readonly companiesService: CompaniesService,
    private readonly applicationsService: ApplicationsService,
    private readonly eventsService: EventsService,
  ) {}

  async extractAll(): Promise<ExtractionBatchResult> {
    const emails = await findEmailsForExtraction(this.db);
    const result: ExtractionBatchResult = {
      processed: 0,
      auto: 0,
      queued: 0,
      failed: 0,
      skipped: 0,
    };

    for (const row of emails) {
      const outcome = await this.extractEmail(row.id);
      result.processed += 1;
      result[outcome] += 1;
    }

    return result;
  }

  async extractEmail(
    emailId: string,
  ): Promise<'auto' | 'queued' | 'failed' | 'skipped'> {
    const rows = await this.db
      .select()
      .from(email)
      .where(eq(email.id, emailId))
      .limit(1);
    const emailRow = rows[0];
    if (!emailRow) {
      throw new NotFoundException('邮件不存在');
    }

    if (emailRow.screenResult === 'IRRELEVANT') {
      await this.db
        .update(email)
        .set({ parseStatus: 'SKIPPED', parsedAt: new Date() })
        .where(eq(email.id, emailId));
      return 'skipped';
    }

    const llmResult = await this.llmService.completeJson({
      promptName: EXTRACT_MAIL_PROMPT_NAME,
      system: EXTRACT_MAIL_SYSTEM,
      user: buildExtractMailUserPrompt({
        subject: emailRow.subject,
        fromName: emailRow.fromName,
        fromAddress: emailRow.fromAddress,
        receivedAt: emailRow.receivedAt,
        bodyText: emailRow.bodyText,
      }),
      schema: mailExtractionOutputSchema,
    });

    if (!llmResult.ok) {
      await this.db
        .update(email)
        .set({
          parseStatus: 'FAILED',
          parsedAt: new Date(),
          reviewStatus: 'NEEDS_REVIEW',
        })
        .where(eq(email.id, emailId));
      return 'failed';
    }

    const extracted = llmResult.data;
    const aliasMatch = await matchCompanyByAlias(this.db, extracted.companyName);
    const company = aliasMatch
      ? await this.companiesService.findById(aliasMatch.companyId)
      : await this.companiesService.findOrCreateByName(extracted.companyName);

    if (!company) {
      await this.db
        .update(email)
        .set({ parseStatus: 'FAILED', parsedAt: new Date() })
        .where(eq(email.id, emailId));
      return 'failed';
    }

    const mergeResult = await resolveApplicationForExtraction(this.db, {
      emailId: emailRow.id,
      companyId: company.id,
      businessUnit: extracted.businessUnit,
      position: extracted.position,
      inReplyTo: emailRow.inReplyTo,
      referencesHeader: emailRow.referencesHeader,
    });

    const now = new Date();
    const extractionRow = {
      id: uuidv4(),
      emailId: emailRow.id,
      eventType: extracted.eventType,
      companyName: extracted.companyName,
      businessUnit: extracted.businessUnit ?? null,
      position: extracted.position ?? null,
      occurredAt: extracted.occurredAt,
      deadlineAt: extracted.deadlineAt ?? null,
      confidence: confidenceToInt(extracted.confidence),
      suggestedApplicationId: mergeResult.applicationId,
      matchMethod: mergeResult.matchMethod,
      rawJson: JSON.stringify(extracted),
      eventCreated: false,
      createdAt: now,
      updatedAt: now,
    };

    const existingExtraction = await this.db
      .select()
      .from(emailExtraction)
      .where(
        and(
          eq(emailExtraction.emailId, emailRow.id),
          eq(emailExtraction.eventType, extracted.eventType),
        ),
      )
      .limit(1);

    if (existingExtraction[0]) {
      await this.db
        .update(emailExtraction)
        .set({
          companyName: extractionRow.companyName,
          businessUnit: extractionRow.businessUnit,
          position: extractionRow.position,
          occurredAt: extractionRow.occurredAt,
          deadlineAt: extractionRow.deadlineAt,
          confidence: extractionRow.confidence,
          suggestedApplicationId: extractionRow.suggestedApplicationId,
          matchMethod: extractionRow.matchMethod,
          rawJson: extractionRow.rawJson,
          updatedAt: now,
        })
        .where(eq(emailExtraction.id, existingExtraction[0].id));
    } else {
      await this.db.insert(emailExtraction).values(extractionRow);
    }

    const alreadyHasEvent = await hasExistingEmailEvent(
      this.db,
      emailRow.id,
      extracted.eventType,
    );

    if (alreadyHasEvent) {
      await this.db
        .update(email)
        .set({
          parseStatus: 'PARSED',
          parsedAt: now,
          confidence: extractionRow.confidence,
          linkedApplicationId: mergeResult.applicationId,
        })
        .where(eq(email.id, emailId));
      return 'skipped';
    }

    const autoConfirm = shouldAutoConfirm({
      confidence: extracted.confidence,
      matchMethod: mergeResult.matchMethod,
    });

    if (autoConfirm && mergeResult.applicationId) {
      await this.createEmailEvent({
        applicationId: mergeResult.applicationId,
        emailId: emailRow.id,
        eventType: extracted.eventType,
        occurredAt: extracted.occurredAt,
        deadlineAt: extracted.deadlineAt ?? null,
        rawText: emailRow.bodyText.slice(0, 500),
      });

      await this.db
        .update(emailExtraction)
        .set({ eventCreated: true, updatedAt: now })
        .where(
          and(
            eq(emailExtraction.emailId, emailRow.id),
            eq(emailExtraction.eventType, extracted.eventType),
          ),
        );

      await this.db
        .update(email)
        .set({
          parseStatus: 'PARSED',
          parsedAt: now,
          confidence: extractionRow.confidence,
          linkedApplicationId: mergeResult.applicationId,
          reviewStatus: 'AUTO',
        })
        .where(eq(email.id, emailId));

      return 'auto';
    }

    await this.db
      .update(email)
      .set({
        parseStatus: 'PARSED',
        parsedAt: now,
        confidence: extractionRow.confidence,
        linkedApplicationId: mergeResult.applicationId,
        reviewStatus: 'NEEDS_REVIEW',
      })
      .where(eq(email.id, emailId));

    return 'queued';
  }

  async getReviewQueue(): Promise<ReviewQueueItem[]> {
    const rows = await this.db
      .select({
        extraction: emailExtraction,
        email,
      })
      .from(emailExtraction)
      .innerJoin(email, eq(emailExtraction.emailId, email.id))
      .where(
        and(
          eq(email.reviewStatus, 'NEEDS_REVIEW'),
          eq(emailExtraction.eventCreated, false),
        ),
      )
      .orderBy(asc(email.receivedAt));

    return rows.map(({ extraction, email: emailRow }) => ({
      extractionId: extraction.id,
      emailId: emailRow.id,
      subject: emailRow.subject,
      fromName: emailRow.fromName,
      fromAddress: emailRow.fromAddress,
      receivedAt: emailRow.receivedAt,
      bodyPreview: emailRow.bodyText.slice(0, 280),
      companyName: extraction.companyName,
      businessUnit: extraction.businessUnit,
      position: extraction.position,
      eventType: extraction.eventType as ReviewQueueItem['eventType'],
      occurredAt: extraction.occurredAt,
      deadlineAt: extraction.deadlineAt,
      confidence: confidenceFromInt(extraction.confidence),
      suggestedApplicationId: extraction.suggestedApplicationId,
      matchMethod: extraction.matchMethod as MatchMethod,
    }));
  }

  async confirmReview(
    extractionId: string,
    input: unknown,
  ): Promise<{ applicationId: string }> {
    const parsed = confirmReviewSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const extractionRows = await this.db
      .select({
        extraction: emailExtraction,
        email,
      })
      .from(emailExtraction)
      .innerJoin(email, eq(emailExtraction.emailId, email.id))
      .where(eq(emailExtraction.id, extractionId))
      .limit(1);
    const record = extractionRows[0];
    if (!record) {
      throw new NotFoundException('确认项不存在');
    }

    const data = parsed.data as ConfirmReviewInput;
    let applicationId = data.applicationId ?? record.extraction.suggestedApplicationId;

    if (!applicationId && data.createApplication) {
      const created = await this.applicationsService.create({
        companyId: data.createApplication.companyId,
        companyName: data.createApplication.companyName,
        businessUnit: data.createApplication.businessUnit,
        position: data.createApplication.position,
        batch: data.createApplication.batch,
        channel: data.createApplication.channel,
        stage: 'APPLIED',
      });
      applicationId = created.application.id;
    }

    if (!applicationId) {
      throw new BadRequestException('必须指定投递或创建新投递');
    }

    const alreadyHasEvent = await hasExistingEmailEvent(
      this.db,
      record.email.id,
      data.eventType,
    );
    if (!alreadyHasEvent) {
      await this.createEmailEvent({
        applicationId,
        emailId: record.email.id,
        eventType: data.eventType,
        occurredAt: data.occurredAt,
        deadlineAt: data.deadlineAt ?? null,
        scheduledAt: data.scheduledAt ?? null,
        round: data.round,
        interviewType: data.interviewType,
        rawText: data.rawText ?? record.email.bodyText.slice(0, 500),
      });
    }

    const confirmedCompanyName =
      data.confirmedCompanyName?.trim() || record.extraction.companyName;
    const applicationRows = await this.db
      .select()
      .from(application)
      .where(eq(application.id, applicationId))
      .limit(1);
    const applicationRow = applicationRows[0];
    if (applicationRow) {
      const companyRecord = await this.companiesService.findById(
        applicationRow.companyId,
      );
      if (
        companyRecord &&
        confirmedCompanyName &&
        confirmedCompanyName !== record.extraction.companyName
      ) {
        await this.applicationsService.createAlias(applicationRow.companyId, {
          alias: record.extraction.companyName,
          source: 'CONFIRMED',
        });
      } else if (companyRecord && confirmedCompanyName) {
        const aliasMatch = await matchCompanyByAlias(
          this.db,
          record.extraction.companyName,
        );
        if (!aliasMatch) {
          await this.applicationsService.createAlias(applicationRow.companyId, {
            alias: record.extraction.companyName,
            source: 'CONFIRMED',
          });
        }
      }
    }

    if (data.addSenderDomainToWhitelist) {
      const domain = extractDomainFromAddress(record.email.fromAddress);
      if (domain) {
        addWhitelistDomain(domain);
      }
    }

    const now = new Date();
    await this.db
      .update(emailExtraction)
      .set({ eventCreated: true, updatedAt: now })
      .where(eq(emailExtraction.id, extractionId));

    await this.db
      .update(email)
      .set({
        reviewStatus: 'CONFIRMED',
        linkedApplicationId: applicationId,
        parseStatus: 'PARSED',
        parsedAt: now,
      })
      .where(eq(email.id, record.email.id));

    return { applicationId };
  }

  async ignoreReview(extractionId: string): Promise<void> {
    const extractionRows = await this.db
      .select()
      .from(emailExtraction)
      .where(eq(emailExtraction.id, extractionId))
      .limit(1);
    const extractionRow = extractionRows[0];
    if (!extractionRow) {
      throw new NotFoundException('确认项不存在');
    }

    await this.db
      .update(email)
      .set({ reviewStatus: 'IGNORED', parsedAt: new Date() })
      .where(eq(email.id, extractionRow.emailId));
  }

  private async createEmailEvent(input: {
    applicationId: string;
    emailId: string;
    eventType: string;
    occurredAt: Date;
    deadlineAt?: Date | null;
    scheduledAt?: Date | null;
    round?: number;
    interviewType?: string;
    rawText?: string;
  }): Promise<void> {
    await this.eventsService.create(input.applicationId, {
      type: input.eventType as never,
      occurredAt: input.occurredAt,
      source: 'EMAIL',
      emailId: input.emailId,
      deadlineAt: input.deadlineAt ?? undefined,
      scheduledAt: input.scheduledAt ?? undefined,
      round: input.round,
      interviewType: input.interviewType as never,
      rawText: input.rawText,
    });
  }
}
