import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../db/database.module';
import { LlmModule } from '../llm/llm.module';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';

@Module({
  imports: [DatabaseModule, LlmModule],
  controllers: [InterviewsController],
  providers: [InterviewsService],
  exports: [InterviewsService],
})
export class InterviewsModule {}
