import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../db/database.module';
import { CompaniesModule } from '../companies/companies.module';
import { ApplicationStateService } from './application-state.service';
import {
  ApplicationsController,
  CompanyAliasesController,
} from './applications.controller';
import { ApplicationsService } from './applications.service';

@Module({
  imports: [DatabaseModule, CompaniesModule],
  controllers: [ApplicationsController, CompanyAliasesController],
  providers: [ApplicationsService, ApplicationStateService],
  exports: [ApplicationsService, ApplicationStateService],
})
export class ApplicationsModule {}
