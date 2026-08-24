import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type FinalizeDebriefInput,
  type ImportCandidate,
  type InterviewNote,
  type ProbeDebriefInput,
  type ProbeOutput,
  type Question,
  type QuestionFilter,
  type StartDebriefInput,
  type StructureDebriefOutput,
  type UpdateQuestionInput,
} from '@job-harvester/shared';
import { InterviewsService } from './interviews.service';

@Controller()
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Post('debrief/structure')
  @HttpCode(HttpStatus.OK)
  structureDebrief(
    @Body() body: StartDebriefInput,
  ): Promise<StructureDebriefOutput> {
    return this.interviewsService.structureDebrief(body);
  }

  @Post('debrief/probe')
  @HttpCode(HttpStatus.OK)
  probeDebrief(@Body() body: ProbeDebriefInput): Promise<ProbeOutput> {
    return this.interviewsService.probeDebrief(body);
  }

  @Post('debrief/finalize')
  @HttpCode(HttpStatus.CREATED)
  finalizeDebrief(
    @Body() body: FinalizeDebriefInput,
  ): Promise<{ interviewNote: InterviewNote; questions: Question[] }> {
    return this.interviewsService.finalizeDebrief(body);
  }

  @Get('applications/:applicationId/interview-notes')
  findInterviewNotes(
    @Param('applicationId') applicationId: string,
  ): Promise<InterviewNote[]> {
    return this.interviewsService.findInterviewNotes(applicationId);
  }

  @Get('interview-notes/:id')
  findInterviewNote(@Param('id') id: string): Promise<InterviewNote> {
    return this.interviewsService.findInterviewNote(id);
  }

  @Get('questions')
  findQuestions(@Query() query: QuestionFilter): Promise<Question[]> {
    return this.interviewsService.findQuestions(query);
  }

  @Patch('questions/:id')
  updateQuestion(
    @Param('id') id: string,
    @Body() body: UpdateQuestionInput,
  ): Promise<Question> {
    return this.interviewsService.updateQuestion(id, body);
  }

  @Get('import-candidates')
  findImportCandidates(): Promise<ImportCandidate[]> {
    return this.interviewsService.findImportCandidates();
  }

  @Post('import-candidates/:id/confirm')
  @HttpCode(HttpStatus.OK)
  confirmImportCandidate(@Param('id') id: string): Promise<Question> {
    return this.interviewsService.confirmImportCandidate(id);
  }

  @Post('import-candidates/:id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  async rejectImportCandidate(@Param('id') id: string): Promise<void> {
    await this.interviewsService.rejectImportCandidate(id);
  }
}
