import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  type ConfirmReviewInput,
  type ReviewQueueItem,
} from '@job-harvester/shared';
import { ExtractionService } from './extraction.service';

@Controller('review-queue')
export class ExtractionController {
  constructor(private readonly extractionService: ExtractionService) {}

  @Get()
  list(): Promise<ReviewQueueItem[]> {
    return this.extractionService.getReviewQueue();
  }

  @Post(':extractionId/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Param('extractionId') extractionId: string,
    @Body() body: ConfirmReviewInput,
  ): Promise<{ applicationId: string }> {
    return this.extractionService.confirmReview(extractionId, body);
  }

  @Post(':extractionId/ignore')
  @HttpCode(HttpStatus.NO_CONTENT)
  async ignore(@Param('extractionId') extractionId: string): Promise<void> {
    await this.extractionService.ignoreReview(extractionId);
  }
}
