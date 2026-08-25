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
  MailStatus,
  MailSyncResult,
} from '@job-harvester/shared';
import { MailSyncService } from './sync.service';

@Controller('mails')
export class MailController {
  constructor(private readonly mailSyncService: MailSyncService) {}

  @Get()
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<EmailListResponse> {
    return this.mailSyncService.listEmails({
      limit: parseOptionalInt(limit),
      offset: parseOptionalInt(offset),
    });
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
