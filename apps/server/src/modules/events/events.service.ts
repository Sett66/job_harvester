import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  createEventSchema,
  updateEventSchema,
  type CreateEventInput,
  type Event,
  type UpdateEventInput,
} from '@job-harvester/shared';
import { asc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE, type AppDatabase } from '../../db/database.provider';
import { application, event } from '../../db/schema';
import { ApplicationStateService } from '../applications/application-state.service';

function normalizeOptionalText(value?: string | null): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class EventsService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly applicationStateService: ApplicationStateService,
  ) {}

  async findByApplication(applicationId: string): Promise<Event[]> {
    await this.ensureApplicationExists(applicationId);
    const rows = await this.db
      .select()
      .from(event)
      .where(eq(event.applicationId, applicationId))
      .orderBy(asc(event.occurredAt), asc(event.createdAt));

    return rows.map((row) => this.toEvent(row));
  }

  async create(
    applicationId: string,
    input: unknown,
  ): Promise<{ event: Event; application: Awaited<ReturnType<ApplicationStateService['recomputeApplication']>> }> {
    await this.ensureApplicationExists(applicationId);
    const parsed = createEventSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const row = this.buildEventRow(applicationId, parsed.data);
    await this.db.insert(event).values(row);
    const applicationRecord =
      await this.applicationStateService.recomputeApplication(applicationId);

    return {
      event: this.toEvent(row as typeof event.$inferSelect),
      application: applicationRecord,
    };
  }

  async update(
    applicationId: string,
    eventId: string,
    input: unknown,
  ): Promise<{ event: Event; application: Awaited<ReturnType<ApplicationStateService['recomputeApplication']>> }> {
    await this.ensureApplicationExists(applicationId);
    const parsed = updateEventSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const existingRows = await this.db
      .select()
      .from(event)
      .where(eq(event.id, eventId))
      .limit(1);
    const existing = existingRows[0];
    if (!existing || existing.applicationId !== applicationId) {
      throw new NotFoundException('事件不存在');
    }

    const data = parsed.data;
    const updated = {
      type: data.type ?? existing.type,
      occurredAt: data.occurredAt ?? existing.occurredAt,
      source: data.source ?? existing.source,
      emailId: data.emailId !== undefined ? data.emailId ?? null : existing.emailId,
      round: data.round !== undefined ? data.round ?? null : existing.round,
      interviewType:
        data.interviewType !== undefined
          ? data.interviewType ?? null
          : existing.interviewType,
      deadlineAt:
        data.deadlineAt !== undefined
          ? data.deadlineAt ?? null
          : existing.deadlineAt,
      scheduledAt:
        data.scheduledAt !== undefined
          ? data.scheduledAt ?? null
          : existing.scheduledAt,
      rawText:
        data.rawText !== undefined
          ? normalizeOptionalText(data.rawText)
          : existing.rawText,
      payload:
        data.payload !== undefined
          ? JSON.stringify(data.payload)
          : existing.payload,
    };

    await this.db.update(event).set(updated).where(eq(event.id, eventId));
    const applicationRecord =
      await this.applicationStateService.recomputeApplication(applicationId);

    return {
      event: this.toEvent({ ...existing, ...updated }),
      application: applicationRecord,
    };
  }

  async remove(applicationId: string, eventId: string): Promise<void> {
    await this.ensureApplicationExists(applicationId);
    const existingRows = await this.db
      .select()
      .from(event)
      .where(eq(event.id, eventId))
      .limit(1);
    const existing = existingRows[0];
    if (!existing || existing.applicationId !== applicationId) {
      throw new NotFoundException('事件不存在');
    }

    await this.db.delete(event).where(eq(event.id, eventId));
    await this.applicationStateService.recomputeApplication(applicationId);
  }

  private buildEventRow(
    applicationId: string,
    data: CreateEventInput,
  ): typeof event.$inferInsert {
    return {
      id: uuidv4(),
      applicationId,
      type: data.type,
      occurredAt: data.occurredAt,
      source: data.source,
      emailId: data.emailId ?? null,
      round: data.round ?? null,
      interviewType: data.interviewType ?? null,
      deadlineAt: data.deadlineAt ?? null,
      scheduledAt: data.scheduledAt ?? null,
      rawText: normalizeOptionalText(data.rawText),
      payload: data.payload ? JSON.stringify(data.payload) : null,
      createdAt: new Date(),
    };
  }

  private async ensureApplicationExists(applicationId: string): Promise<void> {
    const rows = await this.db
      .select({ id: application.id })
      .from(application)
      .where(eq(application.id, applicationId))
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException('投递记录不存在');
    }
  }

  private toEvent(row: typeof event.$inferSelect): Event {
    return {
      id: row.id,
      applicationId: row.applicationId,
      type: row.type as Event['type'],
      occurredAt: row.occurredAt,
      source: row.source as Event['source'],
      emailId: row.emailId ?? null,
      round: row.round ?? null,
      interviewType: (row.interviewType as Event['interviewType']) ?? null,
      deadlineAt: row.deadlineAt ?? null,
      scheduledAt: row.scheduledAt ?? null,
      rawText: row.rawText ?? null,
      payload: row.payload ? (JSON.parse(row.payload) as Record<string, unknown>) : null,
      createdAt: row.createdAt,
    };
  }
}
