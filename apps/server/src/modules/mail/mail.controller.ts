import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type {
  EmailDetail,
  EmailListResponse,
  MailScreenStats,
  MailStatus,
  MailSyncResult,
  ScreenResult,
} from '@job-harvester/shared';
import { screenResultSchema } from '@job-harvester/shared';
import { MailSyncService } from './sync.service';
import { ScreenService } from './screen.service';

@Controller('mails')
export class MailController {
  constructor(
    private readonly mailSyncService: MailSyncService,
    private readonly screenService: ScreenService,
  ) {}

  @Get()
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('screenResult') screenResult?: string,
  ): Promise<EmailListResponse> {
    return this.mailSyncService.listEmails({
      limit: parseOptionalInt(limit),
      offset: parseOptionalInt(offset),
      screenResult: parseScreenResult(screenResult),
    });
  }

  @Get('screen-stats')
  screenStats(): Promise<MailScreenStats> {
    return this.screenService.getStats();
  }

  @Get('status')
  status(): Promise<MailStatus> {
    return this.mailSyncService.getStatus();
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  sync(): Promise<MailSyncResult> {
    return this.mailSyncService.sync();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<EmailDetail> {
    const detail = await this.mailSyncService.getEmail(id);
    if (!detail) {
      throw new NotFoundException('邮件不存在');
    }
    return detail;
  }
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseScreenResult(value: string | undefined): ScreenResult | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  const parsed = screenResultSchema.safeParse(value.trim());
  return parsed.success ? parsed.data : undefined;
}
