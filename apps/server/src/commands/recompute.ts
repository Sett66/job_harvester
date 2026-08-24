import path from 'node:path';
import { createDatabase } from '../db/database.provider';
import { recomputeAllApplications } from '../modules/applications/application-recompute';

async function main() {
  const dbPath =
    process.env.DATABASE_PATH ??
    path.resolve(process.cwd(), '../../data/app.db');
  const db = createDatabase(dbPath);
  const count = await recomputeAllApplications(db);
  console.log(`Recomputed ${count} application(s).`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
