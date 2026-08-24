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
  importKey: text('import_key'),
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
  importKey: text('import_key').notNull(),
  status: text('status').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export type InterviewNoteRow = typeof interviewNote.$inferSelect;
export type NewInterviewNoteRow = typeof interviewNote.$inferInsert;
export type QuestionRow = typeof question.$inferSelect;
export type NewQuestionRow = typeof question.$inferInsert;
export type ImportCandidateRow = typeof importCandidate.$inferSelect;
export type NewImportCandidateRow = typeof importCandidate.$inferInsert;
