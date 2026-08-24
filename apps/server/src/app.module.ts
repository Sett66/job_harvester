import { Module } from '@nestjs/common';
import { ApplicationsModule } from './modules/applications/applications.module';
import { CompaniesModule } from './modules/companies/companies.module';

@Module({
  imports: [CompaniesModule, ApplicationsModule],
})
export class AppModule {}
