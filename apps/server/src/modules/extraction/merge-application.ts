import { and, eq, ne, or, sql } from 'drizzle-orm';
import type { MatchMethod } from '@job-harvester/shared';
import type { AppDatabase } from '../../db/database.provider';
import { application, email, event } from '../../db/schema';
import { batchesMatch } from './batch-match';

function normalizeText(value?: string | null): string {
  return (value ?? '').replace(/[\s\-－—_]+/g, '').toLowerCase();
}

function parseMessageIds(value?: string | null): string[] {
  if (!value) {
    return [];
  }
  return [...value.matchAll(/<([^>]+)>/g)].map((match) => match[1]!);
}

export type MergeApplicationResult = {
  applicationId: string | null;
  matchMethod: MatchMethod;
};

export async function resolveApplicationForExtraction(
  db: AppDatabase,
  input: {
    emailId: string;
    companyId: string;
    batch: string;
    businessUnit?: string | null;
    position?: string | null;
    inReplyTo?: string | null;
    referencesHeader?: string | null;
  },
): Promise<MergeApplicationResult> {
  const extractedBatch = input.batch.trim();
  if (!extractedBatch) {
    return { applicationId: null, matchMethod: 'NONE' };
  }

  async function applicationBatchMatches(applicationId: string): Promise<boolean> {
    const rows = await db
      .select({ batch: application.batch })
      .from(application)
      .where(eq(application.id, applicationId))
      .limit(1);
    return batchesMatch(extractedBatch, rows[0]?.batch);
  }

  const threadIds = [
    ...parseMessageIds(input.inReplyTo),
    ...parseMessageIds(input.referencesHeader),
  ];

  if (threadIds.length > 0) {
    for (const messageId of threadIds) {
      const relatedEmails = await db
        .select()
        .from(email)
        .where(eq(email.messageId, messageId))
        .limit(1);
      const related = relatedEmails[0];
      if (related?.linkedApplicationId) {
        if (await applicationBatchMatches(related.linkedApplicationId)) {
          return {
            applicationId: related.linkedApplicationId,
            matchMethod: 'THREAD',
          };
        }
        continue;
      }

      const relatedEvents = await db
        .select()
        .from(event)
        .where(eq(event.emailId, related?.id ?? ''))
        .limit(1);
      if (relatedEvents[0]?.applicationId) {
        if (await applicationBatchMatches(relatedEvents[0].applicationId)) {
          return {
            applicationId: relatedEvents[0].applicationId,
            matchMethod: 'THREAD',
          };
        }
      }
    }
  }

  const companyApplications = await db
    .select()
    .from(application)
    .where(
      and(
        eq(application.companyId, input.companyId),
        ne(application.stage, 'CLOSED'),
      ),
    );

  const batchMatchedApplications = companyApplications.filter((row) =>
    batchesMatch(extractedBatch, row.batch),
  );

  const normalizedBusinessUnit = normalizeText(input.businessUnit);
  const normalizedPosition = normalizeText(input.position);

  if (normalizedBusinessUnit || normalizedPosition) {
    for (const row of batchMatchedApplications) {
      const businessUnitMatch =
        normalizedBusinessUnit &&
        normalizeText(row.businessUnit) === normalizedBusinessUnit;
      const positionMatch =
        normalizedPosition && normalizeText(row.position) === normalizedPosition;
      if (businessUnitMatch || positionMatch) {
        return {
          applicationId: row.id,
          matchMethod: 'BUSINESS_UNIT',
        };
      }
    }
  }

  if (batchMatchedApplications.length === 1) {
    return {
      applicationId: batchMatchedApplications[0]!.id,
      matchMethod: 'SINGLE_ACTIVE',
    };
  }

  return {
    applicationId: null,
    matchMethod: 'NONE',
  };
}

export async function hasExistingEmailEvent(
  db: AppDatabase,
  emailId: string,
  eventType: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: event.id })
    .from(event)
    .where(and(eq(event.emailId, emailId), eq(event.type, eventType)))
    .limit(1);
  return rows.length > 0;
}

export function getAutoConfidenceThreshold(): number {
  const configured = process.env.EXTRACTION_AUTO_CONFIDENCE;
  if (configured) {
    const parsed = Number(configured);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }
  return 0.85;
}

export function confidenceToInt(confidence: number): number {
  return Math.round(confidence * 1000);
}

export function confidenceFromInt(value: number): number {
  return value / 1000;
}

export function shouldAutoConfirm(input: {
  confidence: number;
  matchMethod: MatchMethod;
}): boolean {
  return (
    input.confidence >= getAutoConfidenceThreshold() &&
    input.matchMethod !== 'NONE'
  );
}

export function canSafelyAutoCreateEvent(input: {
  eventType: string;
  deadlineAt?: Date | null;
  scheduledAt?: Date | null;
  round?: number | null;
}): boolean {
  if (
    input.eventType === 'EXAM_INVITE' ||
    input.eventType === 'ASSESSMENT_INVITE'
  ) {
    return input.deadlineAt != null;
  }

  if (input.eventType === 'INTERVIEW_SCHEDULED') {
    return input.scheduledAt != null && input.round != null;
  }

  return true;
}

export async function countEvents(db: AppDatabase): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)` }).from(event);
  return rows[0]?.count ?? 0;
}

export async function findEmailsForExtraction(db: AppDatabase) {
  return db
    .select()
    .from(email)
    .where(
      or(eq(email.screenResult, 'SUSPECT'), eq(email.screenResult, 'RELEVANT')),
    );
}
