import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const company = sqliteTable('company', {
  id: text('id').primaryKey(),
  canonicalName: text('canonical_name').notNull(),
  industry: text('industry'),
  website: text('website'),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export type CompanyRow = typeof company.$inferSelect;
export type NewCompanyRow = typeof company.$inferInsert;
