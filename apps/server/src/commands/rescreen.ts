import path from 'node:path';
import { createDatabase } from '../db/database.provider';
import { ensureScreenRulesFile } from '../modules/mail/screen-rules';
import { ScreenService } from '../modules/mail/screen.service';

async function main() {
  ensureScreenRulesFile();

  const dbPath =
    process.env.DATABASE_PATH ??
    path.resolve(process.cwd(), '../../data/app.db');
  const db = createDatabase(dbPath);
  const screenService = new ScreenService(db as never);
  const result = await screenService.rescreenAll();

  console.log(`Rescreen complete: ${result.processed} processed`);
  console.log(`  IRRELEVANT: ${result.stats.irrelevant}`);
  console.log(`  SUSPECT: ${result.stats.suspect}`);
  console.log(`  RELEVANT: ${result.stats.relevant}`);
  console.log(`  TOTAL: ${result.stats.total}`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
