import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../db/database.provider';
import { application } from '../db/schema';
import { recomputeAllApplications } from '../modules/applications/application-recompute';

const TARGET_BATCH = '2027暑期实习';

/** Excel 导入时误用的默认批次，统一修正为 TARGET_BATCH */
const LEGACY_BATCHES = ['2026春招', '2026暑期实习', '暑期实习'];

async function main() {
  const dbPath =
    process.env.DATABASE_PATH ??
    path.resolve(process.cwd(), '../../data/app.db');
  const db = createDatabase(dbPath);

  const rows = await db
    .select({ id: application.id, batch: application.batch })
    .from(application)
    .where(inArray(application.batch, LEGACY_BATCHES));

  if (rows.length === 0) {
    console.log('没有需要修正的投递记录');
    return;
  }

  const byBatch = new Map<string, number>();
  for (const row of rows) {
    byBatch.set(row.batch, (byBatch.get(row.batch) ?? 0) + 1);
  }

  await db
    .update(application)
    .set({ batch: TARGET_BATCH })
    .where(inArray(application.batch, LEGACY_BATCHES));

  const recomputed = await recomputeAllApplications(db);

  console.log(`已将 ${rows.length} 条投递的批次统一为「${TARGET_BATCH}」：`);
  for (const [batch, count] of byBatch.entries()) {
    console.log(`  ${batch} → ${TARGET_BATCH}: ${count} 条`);
  }
  console.log(`已重算 ${recomputed} 条投递的派生状态`);
  console.log('');
  console.log('建议接着运行：pnpm --filter @job-harvester/server reextract');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
