import { z } from 'zod';
import { parseStatusSchema, reviewStatusSchema, screenResultSchema } from './extraction';

export const emailAttachmentSchema = z.object({
  id: z.string().uuid(),
  emailId: z.string().uuid(),
  filename: z.string(),
  path: z.string(),
  size: z.number().int().nonnegative(),
  mime: z.string().nullable(),
});

export type EmailAttachment = z.infer<typeof emailAttachmentSchema>;

export const emailListItemSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string(),
  folder: z.string(),
  fromName: z.string().nullable(),
  fromAddress: z.string(),
  subject: z.string(),
  receivedAt: z.coerce.date(),
  bodyPreview: z.string(),
  hasAttachment: z.boolean(),
  screenResult: screenResultSchema,
  parseStatus: parseStatusSchema,
});

export type EmailListItem = z.infer<typeof emailListItemSchema>;

export const emailDetailSchema = emailListItemSchema.extend({
  bodyText: z.string(),
  bodyHtmlPath: z.string().nullable(),
  rawPath: z.string().nullable(),
  inReplyTo: z.string().nullable(),
  referencesHeader: z.string().nullable(),
  reviewStatus: reviewStatusSchema,
  attachments: z.array(emailAttachmentSchema),
});

export type EmailDetail = z.infer<typeof emailDetailSchema>;

export const emailListResponseSchema = z.object({
  items: z.array(emailListItemSchema),
  total: z.number().int().nonnegative(),
});

export type EmailListResponse = z.infer<typeof emailListResponseSchema>;

export const mailSyncErrorSchema = z.object({
  folder: z.string(),
  uid: z.number().int().optional(),
  message: z.string(),
});

export type MailSyncError = z.infer<typeof mailSyncErrorSchema>;

export const mailSyncResultSchema = z.object({
  scannedFolders: z.array(z.string()),
  fetched: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  errors: z.array(mailSyncErrorSchema),
});

export type MailSyncResult = z.infer<typeof mailSyncResultSchema>;

export const mailSyncStateItemSchema = z.object({
  folder: z.string(),
  lastUid: z.number().int().nonnegative(),
  lastSyncAt: z.coerce.date().nullable(),
});

export type MailSyncStateItem = z.infer<typeof mailSyncStateItemSchema>;

export const mailStatusSchema = z.object({
  address: z.string().nullable(),
  credentialsConfigured: z.boolean(),
  folders: z.array(z.string()),
  since: z.string(),
  syncStates: z.array(mailSyncStateItemSchema),
});

export type MailStatus = z.infer<typeof mailStatusSchema>;
