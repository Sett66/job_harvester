import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  finalizeDebriefSchema,
  probeDebriefSchema,
  probeOutputSchema,
  questionFilterSchema,
  startDebriefSchema,
  structureDebriefOutputSchema,
  updateQuestionSchema,
  type FinalizeDebriefInput,
  type ImportCandidate,
  type InterviewNote,
  type ProbeDebriefInput,
  type ProbeOutput,
  type Question,
  type QuestionFilter,
  type StartDebriefInput,
  type StructureDebriefOutput,
  type StructuredQuestion,
  type UpdateQuestionInput,
} from '@job-harvester/shared';
import { and, asc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE, type AppDatabase } from '../../db/database.provider';
import {
  application,
  company,
  event,
  importCandidate,
  interviewNote,
  question,
} from '../../db/schema';
import { LlmService } from '../llm/llm.service';
import { PROBE_PROMPT } from '../llm/prompts/probe';
import { STRUCTURE_DEBRIEF_PROMPT } from '../llm/prompts/structure-debrief';
import { writeInterviewNoteMarkdown } from './markdown-writer';

function normalizeOptionalText(value?: string | null): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class InterviewsService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly llmService: LlmService,
  ) {}

  async structureDebrief(
    input: StartDebriefInput,
  ): Promise<StructureDebriefOutput> {
    const parsed = startDebriefSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    await this.ensureApplicationExists(parsed.data.applicationId);

    const result = await this.llmService.completeJson({
      promptName: STRUCTURE_DEBRIEF_PROMPT.name,
      system: STRUCTURE_DEBRIEF_PROMPT.system,
      user: STRUCTURE_DEBRIEF_PROMPT.buildUserPrompt(parsed.data.rawDump),
      schema: structureDebriefOutputSchema,
    });

    if (!result.ok) {
      throw new BadRequestException(`结构化失败: ${result.error}`);
    }

    return result.data as StructureDebriefOutput;
  }

  async probeDebrief(input: ProbeDebriefInput): Promise<ProbeOutput> {
    const parsed = probeDebriefSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    if (parsed.data.round >= 3) {
      return {
        reply: '',
        shouldContinue: false,
        updatedQuestions: parsed.data.questions,
      };
    }

    const result = await this.llmService.completeJson({
      promptName: PROBE_PROMPT.name,
      system: PROBE_PROMPT.system,
      user: PROBE_PROMPT.buildUserPrompt(parsed.data),
      schema: probeOutputSchema,
    });

    if (!result.ok) {
      return {
        reply: '',
        shouldContinue: false,
        updatedQuestions: parsed.data.questions,
      };
    }

    const probeResult = result.data as ProbeOutput;

    if (parsed.data.round + 1 >= 3) {
      return {
        ...probeResult,
        shouldContinue: false,
      };
    }

    return probeResult;
  }

  async finalizeDebrief(input: FinalizeDebriefInput): Promise<{
    interviewNote: InterviewNote;
    questions: Question[];
  }> {
    const parsed = finalizeDebriefSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const applicationRow = await this.ensureApplicationExists(
      parsed.data.applicationId,
    );

    if (parsed.data.eventId) {
      await this.ensureEventBelongsToApplication(
        parsed.data.applicationId,
        parsed.data.eventId,
      );
    }

    const noteId = uuidv4();
    const createdAt = new Date();
    const companyName = await this.getCompanyName(applicationRow.companyId);

    const mdPath = writeInterviewNoteMarkdown({
      noteId,
      companyName,
      applicationLabel: [
        applicationRow.businessUnit ?? '（无业务线）',
        applicationRow.batch,
      ].join(' · '),
      rawDump: parsed.data.rawDump,
      summary: parsed.data.summary,
      questions: parsed.data.questions,
      createdAt,
    });

    const noteRow = {
      id: noteId,
      applicationId: parsed.data.applicationId,
      eventId: parsed.data.eventId ?? null,
      mdPath,
      rawDump: parsed.data.rawDump,
      summary: normalizeOptionalText(parsed.data.summary),
      createdAt,
    };

    const eventMeta = parsed.data.eventId
      ? await this.getEventMeta(parsed.data.eventId)
      : null;

    const questionRows = parsed.data.questions.map((item) => {
      const now = new Date();
      const weakAsAnswer = item.weakPoint
        ? [item.myAnswer, `薄弱点：${item.weakPoint}`].filter(Boolean).join('\n')
        : item.myAnswer;

      return {
        id: uuidv4(),
        text: item.text,
        category: normalizeOptionalText(item.category),
        applicationId: parsed.data.applicationId,
        companyId: applicationRow.companyId,
        interviewNoteId: noteId,
        round: eventMeta?.round ?? null,
        interviewType: eventMeta?.interviewType ?? null,
        askedAt: createdAt,
        myAnswer: normalizeOptionalText(weakAsAnswer),
        referenceAnswer: null,
        selfRating: null,
        status: item.weakPoint ? 'WEAK' : 'NEW',
        source: 'INTERVIEW',
        importKey: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    await this.db.insert(interviewNote).values(noteRow);
    if (questionRows.length > 0) {
      await this.db.insert(question).values(questionRows);
    }

    return {
      interviewNote: this.toInterviewNote(noteRow),
      questions: questionRows.map((row) => this.toQuestion(row)),
    };
  }

  async findInterviewNotes(applicationId: string): Promise<InterviewNote[]> {
    await this.ensureApplicationExists(applicationId);
    const rows = await this.db
      .select()
      .from(interviewNote)
      .where(eq(interviewNote.applicationId, applicationId))
      .orderBy(asc(interviewNote.createdAt));
    return rows.map((row) => this.toInterviewNote(row));
  }

  async findInterviewNote(id: string): Promise<InterviewNote> {
    const rows = await this.db
      .select()
      .from(interviewNote)
      .where(eq(interviewNote.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('面试记录不存在');
    }
    return this.toInterviewNote(row);
  }

  async findQuestions(filterInput: QuestionFilter = {}): Promise<Question[]> {
    const parsed = questionFilterSchema.safeParse(filterInput);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const conditions = [];
    if (parsed.data.companyId) {
      conditions.push(eq(question.companyId, parsed.data.companyId));
    }
    if (parsed.data.applicationId) {
      conditions.push(eq(question.applicationId, parsed.data.applicationId));
    }
    if (parsed.data.category) {
      conditions.push(eq(question.category, parsed.data.category));
    }
    if (parsed.data.status) {
      conditions.push(eq(question.status, parsed.data.status));
    }

    const rows = await this.db
      .select()
      .from(question)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(question.createdAt));

    return rows.map((row) => this.toQuestion(row));
  }

  async updateQuestion(id: string, input: UpdateQuestionInput): Promise<Question> {
    const parsed = updateQuestionSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const existingRows = await this.db
      .select()
      .from(question)
      .where(eq(question.id, id))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) {
      throw new NotFoundException('题目不存在');
    }

    const data = parsed.data;
    const updated = {
      text: data.text ?? existing.text,
      category:
        data.category !== undefined
          ? normalizeOptionalText(data.category)
          : existing.category,
      myAnswer:
        data.myAnswer !== undefined
          ? normalizeOptionalText(data.myAnswer)
          : existing.myAnswer,
      selfRating:
        data.selfRating !== undefined ? data.selfRating ?? null : existing.selfRating,
      status: data.status ?? existing.status,
      updatedAt: new Date(),
    };

    await this.db.update(question).set(updated).where(eq(question.id, id));
    return this.toQuestion({ ...existing, ...updated });
  }

  async findImportCandidates(): Promise<ImportCandidate[]> {
    const rows = await this.db
      .select()
      .from(importCandidate)
      .where(eq(importCandidate.status, 'PENDING'))
      .orderBy(asc(importCandidate.createdAt));
    return rows.map((row) => this.toImportCandidate(row));
  }

  async confirmImportCandidate(id: string): Promise<Question> {
    const rows = await this.db
      .select()
      .from(importCandidate)
      .where(eq(importCandidate.id, id))
      .limit(1);
    const candidate = rows[0];
    if (!candidate) {
      throw new NotFoundException('导入候选不存在');
    }
    if (candidate.status !== 'PENDING') {
      throw new BadRequestException('该候选已处理');
    }

    const now = new Date();
    const questionRow = {
      id: uuidv4(),
      text: candidate.text,
      category: candidate.category,
      applicationId: candidate.applicationId,
      companyId: candidate.companyId,
      interviewNoteId: null,
      round: candidate.round,
      interviewType: candidate.interviewType,
      askedAt: null,
      myAnswer: null,
      referenceAnswer: null,
      selfRating: null,
      status: 'NEW',
      source: 'IMPORT',
      importKey: candidate.importKey,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(question).values(questionRow);
    await this.db
      .update(importCandidate)
      .set({ status: 'CONFIRMED' })
      .where(eq(importCandidate.id, id));

    return this.toQuestion(questionRow);
  }

  async rejectImportCandidate(id: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(importCandidate)
      .where(eq(importCandidate.id, id))
      .limit(1);
    const candidate = rows[0];
    if (!candidate) {
      throw new NotFoundException('导入候选不存在');
    }

    await this.db
      .update(importCandidate)
      .set({ status: 'REJECTED' })
      .where(eq(importCandidate.id, id));
  }

  private async ensureApplicationExists(applicationId: string) {
    const rows = await this.db
      .select()
      .from(application)
      .where(eq(application.id, applicationId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('投递记录不存在');
    }
    return row;
  }

  private async ensureEventBelongsToApplication(
    applicationId: string,
    eventId: string,
  ): Promise<void> {
    const rows = await this.db
      .select({ applicationId: event.applicationId })
      .from(event)
      .where(eq(event.id, eventId))
      .limit(1);
    const row = rows[0];
    if (!row || row.applicationId !== applicationId) {
      throw new NotFoundException('关联事件不存在');
    }
  }

  private async getCompanyName(companyId: string): Promise<string> {
    const rows = await this.db
      .select({ canonicalName: company.canonicalName })
      .from(company)
      .where(eq(company.id, companyId))
      .limit(1);
    return rows[0]?.canonicalName ?? '未知公司';
  }

  private async getEventMeta(eventId: string) {
    const rows = await this.db
      .select({
        round: event.round,
        interviewType: event.interviewType,
      })
      .from(event)
      .where(eq(event.id, eventId))
      .limit(1);
    return rows[0] ?? null;
  }

  private toInterviewNote(row: typeof interviewNote.$inferSelect): InterviewNote {
    return {
      id: row.id,
      applicationId: row.applicationId,
      eventId: row.eventId ?? null,
      mdPath: row.mdPath,
      rawDump: row.rawDump,
      summary: row.summary ?? null,
      createdAt: row.createdAt,
    };
  }

  private toQuestion(row: typeof question.$inferSelect): Question {
    return {
      id: row.id,
      text: row.text,
      category: row.category ?? null,
      applicationId: row.applicationId ?? null,
      companyId: row.companyId ?? null,
      interviewNoteId: row.interviewNoteId ?? null,
      round: row.round ?? null,
      interviewType: (row.interviewType as Question['interviewType']) ?? null,
      askedAt: row.askedAt ?? null,
      myAnswer: row.myAnswer ?? null,
      referenceAnswer: row.referenceAnswer ?? null,
      selfRating: row.selfRating ?? null,
      status: row.status as Question['status'],
      source: row.source as Question['source'],
      importKey: row.importKey ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toImportCandidate(
    row: typeof importCandidate.$inferSelect,
  ): ImportCandidate {
    return {
      id: row.id,
      text: row.text,
      category: row.category ?? null,
      companyId: row.companyId ?? null,
      applicationId: row.applicationId ?? null,
      round: row.round ?? null,
      interviewType: (row.interviewType as ImportCandidate['interviewType']) ?? null,
      sourceFile: row.sourceFile,
      importKey: row.importKey,
      status: row.status as ImportCandidate['status'],
      createdAt: row.createdAt,
    };
  }
}
