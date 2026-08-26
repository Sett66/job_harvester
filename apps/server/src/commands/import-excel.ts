import path from 'node:path';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { createDatabase, type AppDatabase } from '../db/database.provider';
import { application, company, companyAlias, event } from '../db/schema';
import { recomputeAllApplications } from '../modules/applications/application-recompute';
import {
  isApplyOnlyRow,
  isRevivedOnlyRow,
  splitApplicationCells,
  type SplitEventDraft,
} from '../modules/import/cell-splitter';
import { splitCompany } from '../modules/import/company-splitter';
import { parseXlsx } from '../modules/import/xlsx-parser';

const DEFAULT_BATCH = '2027暑期实习';

type PendingReviewItem = {
  importKey: string;
  companyRaw: string;
  rawText: string;
};

function parseArgs(argv: string[]): { file: string } {
  const fileFlagIndex = argv.indexOf('--file');
  if (fileFlagIndex < 0 || !argv[fileFlagIndex + 1]) {
    throw new Error('Usage: import:excel -- --file <path-to-xlsx>');
  }
  return { file: path.resolve(argv[fileFlagIndex + 1]) };
}

function buildImportKey(filePath: string, rowNumber: number, companyRaw: string): string {
  const fileName = path.basename(filePath);
  return `excel:${fileName}:row${rowNumber}:${companyRaw}`;
}

async function loadExistingImportKeys(db: AppDatabase): Promise<Set<string>> {
  const rows = await db.select({ payload: event.payload }).from(event);
  const keys = new Set<string>();
  for (const row of rows) {
    if (!row.payload) {
      continue;
    }
    try {
      const payload = JSON.parse(row.payload) as { importKey?: string };
      if (payload.importKey) {
        keys.add(payload.importKey);
      }
    } catch {
      // ignore malformed payload
    }
  }
  return keys;
}

async function findOrCreateCompany(
  db: AppDatabase,
  canonicalName: string,
): Promise<string> {
  const existing = await db
    .select({ id: company.id })
    .from(company)
    .where(eq(company.canonicalName, canonicalName))
    .limit(1);
  if (existing[0]) {
    return existing[0].id;
  }

  const now = new Date();
  const id = uuidv4();
  await db.insert(company).values({
    id,
    canonicalName,
    industry: null,
    website: null,
    note: null,
    createdAt: now,
  });
  return id;
}

async function ensureAlias(
  db: AppDatabase,
  companyId: string,
  alias: string,
): Promise<void> {
  const existing = await db
    .select({ id: companyAlias.id })
    .from(companyAlias)
    .where(eq(companyAlias.alias, alias))
    .limit(1);
  if (existing[0]) {
    return;
  }

  await db.insert(companyAlias).values({
    id: uuidv4(),
    companyId,
    alias,
    source: 'IMPORT',
  });
}

function toCellInput(row: ReturnType<typeof parseXlsx>[number]) {
  return {
    appliedAt: row.appliedDate,
    statusCell: row.statusCell,
    colD: row.colD,
    colE: row.colE,
  };
}

function buildEventDrafts(row: ReturnType<typeof parseXlsx>[number]): SplitEventDraft[] {
  const cellInput = toCellInput(row);
  if (isApplyOnlyRow(cellInput) && row.appliedDate) {
    return [
      {
        type: 'APPLY',
        occurredAt: row.appliedDate,
        rawText: `投递 ${row.companyRaw}`,
      },
    ];
  }

  if (isApplyOnlyRow(cellInput)) {
    return [];
  }

  const split = splitApplicationCells(cellInput);
  const drafts = [...split.events];

  if (row.appliedDate && !isRevivedOnlyRow(cellInput)) {
    drafts.unshift({
      type: 'APPLY',
      occurredAt: row.appliedDate,
      rawText: `投递 ${row.companyRaw}`,
    });
  }

  return drafts;
}

function sortDrafts(drafts: SplitEventDraft[]): SplitEventDraft[] {
  return [...drafts].sort(
    (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
  );
}

async function importRow(
  db: AppDatabase,
  filePath: string,
  row: ReturnType<typeof parseXlsx>[number],
  existingKeys: Set<string>,
  pendingReview: PendingReviewItem[],
): Promise<'imported' | 'skipped'> {
  const importKey = buildImportKey(filePath, row.rowNumber, row.companyRaw);
  if (existingKeys.has(importKey)) {
    return 'skipped';
  }

  const { canonicalName, businessUnit, alias } = splitCompany(row.companyRaw);
  const companyId = await findOrCreateCompany(db, canonicalName);
  await ensureAlias(db, companyId, alias);

  const revived = isRevivedOnlyRow(toCellInput(row));
  const drafts = sortDrafts(buildEventDrafts(row));
  if (drafts.length === 0 && !row.appliedDate) {
    drafts.push({
      type: 'NOTE',
      occurredAt: new Date(),
      rawText: row.statusCell ?? row.companyRaw,
      needsReview: true,
    });
  }

  const now = new Date();
  const applicationId = uuidv4();
  const firstEventAt = drafts[0]?.occurredAt ?? row.appliedDate ?? now;

  await db.insert(application).values({
    id: applicationId,
    companyId,
    businessUnit,
    position: null,
    batch: DEFAULT_BATCH,
    channel: revived ? '被捞' : null,
    appliedAt: revived ? null : row.appliedDate,
    stage: 'APPLIED',
    ball: 'THEM',
    outcome: null,
    currentRound: 0,
    currentInterviewType: null,
    lastEventAt: firstEventAt,
    nextDeadlineAt: null,
    note: null,
    createdAt: now,
    updatedAt: now,
  });

  for (const [index, draft] of drafts.entries()) {
    const payload = {
      importKey: index === 0 ? importKey : undefined,
      needsReview: draft.needsReview ?? false,
      excelRow: row.rowNumber,
    };

    if (draft.needsReview) {
      pendingReview.push({
        importKey,
        companyRaw: row.companyRaw,
        rawText: draft.rawText,
      });
    }

    await db.insert(event).values({
      id: uuidv4(),
      applicationId,
      type: draft.type,
      occurredAt: draft.occurredAt,
      source: 'IMPORT',
      emailId: null,
      round: draft.round ?? null,
      interviewType: draft.interviewType ?? null,
      deadlineAt: draft.deadlineAt ?? null,
      scheduledAt: draft.scheduledAt ?? null,
      rawText: draft.rawText,
      payload: JSON.stringify(payload),
      createdAt: now,
    });
  }

  existingKeys.add(importKey);
  return 'imported';
}

export async function runExcelImport(filePath: string): Promise<void> {
  const rows = parseXlsx(filePath);
  const dbPath =
    process.env.DATABASE_PATH ??
    path.resolve(process.cwd(), '../../data/app.db');
  const db = createDatabase(dbPath);
  const existingKeys = await loadExistingImportKeys(db);
  const pendingReview: PendingReviewItem[] = [];

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const result = await importRow(db, filePath, row, existingKeys, pendingReview);
    if (result === 'imported') {
      imported += 1;
    } else {
      skipped += 1;
    }
  }

  const recomputed = await recomputeAllApplications(db);

  console.log(`Parsed ${rows.length} row(s) from ${filePath}`);
  console.log(`Imported ${imported}, skipped ${skipped} (already present)`);
  console.log(`Recomputed ${recomputed} application(s)`);

  if (pendingReview.length > 0) {
    console.log('\n待人工确认:');
    for (const item of pendingReview) {
      console.log(`- [${item.companyRaw}] ${item.rawText}`);
    }
  }
}

async function main() {
  const { file } = parseArgs(process.argv.slice(2));
  await runExcelImport(file);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
