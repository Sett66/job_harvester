import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../db/database.module';
import { CompaniesModule } from '../companies/companies.module';
import {
  ApplicationsController,
  CompanyAliasesController,
} from './applications.controller';
import { ApplicationsService } from './applications.service';

@Module({
  imports: [DatabaseModule, CompaniesModule],
  controllers: [ApplicationsController, CompanyAliasesController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
