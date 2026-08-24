import { Module } from '@nestjs/common';
import { ApplicationsModule } from './modules/applications/applications.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { EventsModule } from './modules/events/events.module';

@Module({
  imports: [CompaniesModule, ApplicationsModule, EventsModule],
})
export class AppModule {}
