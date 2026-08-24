import { Module } from '@nestjs/common';
import { CompaniesModule } from './modules/companies/companies.module';

@Module({
  imports: [CompaniesModule],
})
export class AppModule {}
