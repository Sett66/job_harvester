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
