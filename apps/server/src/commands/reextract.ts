import path from 'node:path';
import { getLlmEnv } from '../config/env.schema';
import { createDatabase } from '../db/database.provider';
import { ExtractionService } from '../modules/extraction/extraction.service';
import { LlmService } from '../modules/llm/llm.service';
import { ApplicationsService } from '../modules/applications/applications.service';
import { ApplicationStateService } from '../modules/applications/application-state.service';
import { CompaniesService } from '../modules/companies/companies.service';
import { EventsService } from '../modules/events/events.service';
import { countEvents } from '../modules/extraction/merge-application';

async function main() {
  getLlmEnv();
  const dbPath =
    process.env.DATABASE_PATH ??
    path.resolve(process.cwd(), '../../data/app.db');
  const db = createDatabase(dbPath);

  const companiesService = new CompaniesService(db as never);
  const applicationStateService = new ApplicationStateService(db as never);
  const eventsService = new EventsService(db as never, applicationStateService);
  const applicationsService = new ApplicationsService(db as never, companiesService);
  const llmService = new LlmService();
  const extractionService = new ExtractionService(
    db as never,
    llmService,
    companiesService,
    applicationsService,
    eventsService,
  );

  const beforeCount = await countEvents(db as never);
  const result = await extractionService.extractAll();
  const afterCount = await countEvents(db as never);

  console.log('Extraction batch result:', result);
  console.log(`Events before: ${beforeCount}, after: ${afterCount}, delta: ${afterCount - beforeCount}`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
