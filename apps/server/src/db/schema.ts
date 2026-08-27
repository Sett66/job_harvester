import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const company = sqliteTable('company', {
  id: text('id').primaryKey(),
  canonicalName: text('canonical_name').notNull(),
  industry: text('industry'),
  website: text('website'),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const application = sqliteTable('application', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => company.id),
  businessUnit: text('business_unit'),
  position: text('position'),
  batch: text('batch').notNull(),
  channel: text('channel'),
  appliedAt: integer('applied_at', { mode: 'timestamp_ms' }),
  stage: text('stage').notNull(),
  ball: text('ball'),
  outcome: text('outcome'),
  currentRound: integer('current_round').notNull().default(0),
  currentInterviewType: text('current_interview_type'),
  lastEventAt: integer('last_event_at', { mode: 'timestamp_ms' }).notNull(),
  nextDeadlineAt: integer('next_deadline_at', { mode: 'timestamp_ms' }),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const companyAlias = sqliteTable('company_alias', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => company.id),
  alias: text('alias').notNull(),
  source: text('source').notNull(),
});

export type CompanyRow = typeof company.$inferSelect;
export type NewCompanyRow = typeof company.$inferInsert;
export type ApplicationRow = typeof application.$inferSelect;
export type NewApplicationRow = typeof application.$inferInsert;
export type CompanyAliasRow = typeof companyAlias.$inferSelect;
export type NewCompanyAliasRow = typeof companyAlias.$inferInsert;

export const event = sqliteTable('event', {
  id: text('id').primaryKey(),
  applicationId: text('application_id')
    .notNull()
    .references(() => application.id),
  type: text('type').notNull(),
  occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  source: text('source').notNull(),
  emailId: text('email_id'),
  round: integer('round'),
  interviewType: text('interview_type'),
  deadlineAt: integer('deadline_at', { mode: 'timestamp_ms' }),
  scheduledAt: integer('scheduled_at', { mode: 'timestamp_ms' }),
  rawText: text('raw_text'),
  payload: text('payload'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export type EventRow = typeof event.$inferSelect;
export type NewEventRow = typeof event.$inferInsert;

export const email = sqliteTable('email', {
  id: text('id').primaryKey(),
  messageId: text('message_id').notNull().unique(),
  folder: text('folder').notNull(),
  fromName: text('from_name'),
  fromAddress: text('from_address').notNull(),
  subject: text('subject').notNull(),
  receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
  bodyText: text('body_text').notNull(),
  bodyHtmlPath: text('body_html_path'),
  rawPath: text('raw_path'),
  hasAttachment: integer('has_attachment', { mode: 'boolean' }).notNull().default(false),
  inReplyTo: text('in_reply_to'),
  referencesHeader: text('references_header'),
  screenResult: text('screen_result').notNull().default('SUSPECT'),
  parseStatus: text('parse_status').notNull().default('PENDING'),
  parsedAt: integer('parsed_at', { mode: 'timestamp_ms' }),
  confidence: integer('confidence'),
  linkedApplicationId: text('linked_application_id').references(() => application.id),
  reviewStatus: text('review_status').notNull().default('NEEDS_REVIEW'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const emailExtraction = sqliteTable('email_extraction', {
  id: text('id').primaryKey(),
  emailId: text('email_id')
    .notNull()
    .references(() => email.id),
  eventType: text('event_type').notNull(),
  companyName: text('company_name').notNull(),
  businessUnit: text('business_unit'),
  position: text('position'),
  batch: text('batch'),
  occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  deadlineAt: integer('deadline_at', { mode: 'timestamp_ms' }),
  confidence: integer('confidence').notNull(),
  suggestedApplicationId: text('suggested_application_id').references(
    () => application.id,
  ),
  matchMethod: text('match_method').notNull(),
  rawJson: text('raw_json').notNull(),
  eventCreated: integer('event_created', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type EmailRow = typeof email.$inferSelect;
export type NewEmailRow = typeof email.$inferInsert;
export type EmailExtractionRow = typeof emailExtraction.$inferSelect;
export type NewEmailExtractionRow = typeof emailExtraction.$inferInsert;

export const attachment = sqliteTable('attachment', {
  id: text('id').primaryKey(),
  emailId: text('email_id')
    .notNull()
    .references(() => email.id),
  filename: text('filename').notNull(),
  path: text('path').notNull(),
  size: integer('size').notNull(),
  mime: text('mime'),
});

export const syncState = sqliteTable('sync_state', {
  id: text('id').primaryKey(),
  folder: text('folder').notNull().unique(),
  lastUid: integer('last_uid').notNull().default(0),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp_ms' }),
});

export type AttachmentRow = typeof attachment.$inferSelect;
export type NewAttachmentRow = typeof attachment.$inferInsert;
export type SyncStateRow = typeof syncState.$inferSelect;
export type NewSyncStateRow = typeof syncState.$inferInsert;

export const interviewNote = sqliteTable('interview_note', {
  id: text('id').primaryKey(),
  applicationId: text('application_id')
    .notNull()
    .references(() => application.id),
  eventId: text('event_id'),
  mdPath: text('md_path').notNull(),
  rawDump: text('raw_dump').notNull(),
  summary: text('summary'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const question = sqliteTable('question', {
  id: text('id').primaryKey(),
  text: text('text').notNull(),
  category: text('category'),
  applicationId: text('application_id').references(() => application.id),
  companyId: text('company_id').references(() => company.id),
  interviewNoteId: text('interview_note_id').references(() => interviewNote.id),
  round: integer('round'),
  interviewType: text('interview_type'),
  askedAt: integer('asked_at', { mode: 'timestamp_ms' }),
  myAnswer: text('my_answer'),
  referenceAnswer: text('reference_answer'),
  selfRating: integer('self_rating'),
  status: text('status').notNull(),
  source: text('source').notNull(),
  importKey: text('import_key').unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const importCandidate = sqliteTable('import_candidate', {
  id: text('id').primaryKey(),
  text: text('text').notNull(),
  category: text('category'),
  companyId: text('company_id').references(() => company.id),
  applicationId: text('application_id').references(() => application.id),
  round: integer('round'),
  interviewType: text('interview_type'),
  sourceFile: text('source_file').notNull(),
  importKey: text('import_key').notNull().unique(),
  status: text('status').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export type InterviewNoteRow = typeof interviewNote.$inferSelect;
export type NewInterviewNoteRow = typeof interviewNote.$inferInsert;
export type QuestionRow = typeof question.$inferSelect;
export type NewQuestionRow = typeof question.$inferInsert;
export type ImportCandidateRow = typeof importCandidate.$inferSelect;
export type NewImportCandidateRow = typeof importCandidate.$inferInsert;
