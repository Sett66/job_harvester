import { z } from 'zod';
import { eventTypeSchema } from './event';

export const screenResultSchema = z.enum(['IRRELEVANT', 'SUSPECT', 'RELEVANT']);

export const parseStatusSchema = z.enum([
  'PENDING',
  'PARSED',
  'FAILED',
  'SKIPPED',
]);

export const reviewStatusSchema = z.enum([
  'AUTO',
  'NEEDS_REVIEW',
  'CONFIRMED',
  'IGNORED',
]);

export const matchMethodSchema = z.enum([
  'THREAD',
  'BUSINESS_UNIT',
  'SINGLE_ACTIVE',
  'NONE',
]);

export type ScreenResult = z.infer<typeof screenResultSchema>;
export type ParseStatus = z.infer<typeof parseStatusSchema>;
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;
export type MatchMethod = z.infer<typeof matchMethodSchema>;

export const mailExtractionOutputSchema = z.object({
  companyName: z.string().min(1),
  businessUnit: z.string().optional(),
  position: z.string().optional(),
  batch: z.string().min(1),
  eventType: eventTypeSchema,
  occurredAt: z.coerce.date(),
  deadlineAt: z.coerce.date().nullable().optional(),
  confidence: z.number().min(0).max(1),
});

export type MailExtractionOutput = z.infer<typeof mailExtractionOutputSchema>;

export const reviewQueueItemSchema = z.object({
  extractionId: z.string().uuid(),
  emailId: z.string().uuid(),
  subject: z.string(),
  fromName: z.string().nullable(),
  fromAddress: z.string(),
  receivedAt: z.coerce.date(),
  bodyPreview: z.string(),
  companyName: z.string(),
  businessUnit: z.string().nullable(),
  position: z.string().nullable(),
  batch: z.string().nullable(),
  eventType: eventTypeSchema,
  occurredAt: z.coerce.date(),
  deadlineAt: z.coerce.date().nullable(),
  confidence: z.number(),
  suggestedApplicationId: z.string().uuid().nullable(),
  matchMethod: matchMethodSchema,
});

export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;

export const confirmReviewSchema = z.object({
  applicationId: z.string().uuid().optional(),
  createApplication: z
    .object({
      companyId: z.string().uuid().optional(),
      companyName: z.string().optional(),
      businessUnit: z.string().optional(),
      position: z.string().optional(),
      batch: z.string(),
      channel: z.string().optional(),
    })
    .optional(),
  eventType: eventTypeSchema,
  occurredAt: z.coerce.date(),
  deadlineAt: z.coerce.date().nullable().optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
  round: z.number().int().min(1).optional(),
  interviewType: z.string().optional(),
  rawText: z.string().optional(),
  confirmedCompanyName: z.string().optional(),
  addSenderDomainToWhitelist: z.boolean().optional(),
});

export type ConfirmReviewInput = z.infer<typeof confirmReviewSchema>;

export const extractionBatchResultSchema = z.object({
  processed: z.number().int().nonnegative(),
  auto: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

export type ExtractionBatchResult = z.infer<typeof extractionBatchResultSchema>;
