import { Module } from '@nestjs/common';
import { ApplicationsModule } from './modules/applications/applications.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { EventsModule } from './modules/events/events.module';
import { InterviewsModule } from './modules/interviews/interviews.module';
import { LlmModule } from './modules/llm/llm.module';

@Module({
  imports: [
    CompaniesModule,
    ApplicationsModule,
    EventsModule,
    InterviewsModule,
    LlmModule,
  ],
})
export class AppModule {}
