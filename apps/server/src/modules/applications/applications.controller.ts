import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  type Application,
  type ApplicationGrouped,
  type BoardView,
  type CompanyAlias,
  type CreateApplicationInput,
  type CreateApplicationResponse,
  type CreateCompanyAliasInput,
  type TodayView,
  type UpdateApplicationInput,
} from '@job-harvester/shared';
import { ApplicationsService } from './applications.service';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  findGrouped(): Promise<ApplicationGrouped[]> {
    return this.applicationsService.findGrouped();
  }

  @Get('board')
  findBoard(): Promise<BoardView> {
    return this.applicationsService.findBoard();
  }

  @Get('today')
  findToday(): Promise<TodayView> {
    return this.applicationsService.findToday();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() body: CreateApplicationInput,
  ): Promise<CreateApplicationResponse> {
    return this.applicationsService.create(body);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Application> {
    return this.applicationsService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateApplicationInput,
  ): Promise<Application> {
    return this.applicationsService.update(id, body);
  }

  @Post(':id/archive-stale')
  @HttpCode(HttpStatus.OK)
  archiveStale(@Param('id') id: string): Promise<Application> {
    return this.applicationsService.archiveAsAssumedDead(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.applicationsService.remove(id);
  }
}

@Controller('companies/:companyId/aliases')
export class CompanyAliasesController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  list(@Param('companyId') companyId: string): Promise<CompanyAlias[]> {
    return this.applicationsService.listAliases(companyId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('companyId') companyId: string,
    @Body() body: CreateCompanyAliasInput,
  ): Promise<CompanyAlias> {
    return this.applicationsService.createAlias(companyId, body);
  }

  @Delete(':aliasId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('companyId') companyId: string,
    @Param('aliasId') aliasId: string,
  ): Promise<void> {
    await this.applicationsService.removeAlias(companyId, aliasId);
  }
}
