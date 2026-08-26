import { Module } from '@nestjs/common';
import { ApplicationsModule } from './modules/applications/applications.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { EventsModule } from './modules/events/events.module';
import { ExtractionModule } from './modules/extraction/extraction.module';
import { LlmModule } from './modules/llm/llm.module';
import { MailModule } from './modules/mail/mail.module';

@Module({
  imports: [
    CompaniesModule,
    ApplicationsModule,
    EventsModule,
    LlmModule,
    ExtractionModule,
    MailModule,
  ],
})
export class AppModule {}
