import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../db/database.module';
import { ApplicationsModule } from '../applications/applications.module';
import { CompaniesModule } from '../companies/companies.module';
import { EventsModule } from '../events/events.module';
import { LlmModule } from '../llm/llm.module';
import { ExtractionController } from './extraction.controller';
import { ExtractionBatchController } from './extraction-batch.controller';
import { ExtractionService } from './extraction.service';

@Module({
  imports: [
    DatabaseModule,
    LlmModule,
    CompaniesModule,
    ApplicationsModule,
    EventsModule,
  ],
  controllers: [ExtractionController, ExtractionBatchController],
  providers: [ExtractionService],
  exports: [ExtractionService],
})
export class ExtractionModule {}
