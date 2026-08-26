import path from 'node:path';
import { createDatabase } from '../db/database.provider';
import { ExtractionService } from '../modules/extraction/extraction.service';
import { ApplicationsService } from '../modules/applications/applications.service';
import { ApplicationStateService } from '../modules/applications/application-state.service';
import { CompaniesService } from '../modules/companies/companies.service';
import { EventsService } from '../modules/events/events.service';
import { LlmService } from '../modules/llm/llm.service';

async function main() {
  const dbPath =
    process.env.DATABASE_PATH ??
    path.resolve(process.cwd(), '../../data/app.db');
  const db = createDatabase(dbPath);

  const companiesService = new CompaniesService(db as never);
  const applicationStateService = new ApplicationStateService(db as never);
  const eventsService = new EventsService(db as never, applicationStateService);
  const applicationsService = new ApplicationsService(db as never, companiesService);
  const extractionService = new ExtractionService(
    db as never,
    new LlmService(),
    companiesService,
    applicationsService,
    eventsService,
  );

  const result = await extractionService.remergeAll();
  console.log('Remerge complete:', result);
  console.log(
    `已更新 ${result.updated} 条抽取记录，其中 ${result.matched} 条找到建议投递，${result.none} 条仍为 NONE`,
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
