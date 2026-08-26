import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { type ExtractionBatchResult } from '@job-harvester/shared';
import { ExtractionService } from './extraction.service';

@Controller('extraction')
export class ExtractionBatchController {
  constructor(private readonly extractionService: ExtractionService) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  run(): Promise<ExtractionBatchResult> {
    return this.extractionService.extractAll();
  }
}
