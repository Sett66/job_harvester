import {
  deriveApplicationState,
  toDeriveEventInput,
  type Application,
} from '@job-harvester/shared';
import { asc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../../db/database.provider';
import { application, event } from '../../db/schema';

function toApplication(row: typeof application.$inferSelect): Application {
  return {
    id: row.id,
    companyId: row.companyId,
    businessUnit: row.businessUnit ?? null,
    position: row.position ?? null,
    batch: row.batch,
    channel: (row.channel as Application['channel']) ?? null,
    appliedAt: row.appliedAt ?? null,
    stage: row.stage as Application['stage'],
    ball: (row.ball as Application['ball']) ?? null,
    outcome: (row.outcome as Application['outcome']) ?? null,
    currentRound: row.currentRound,
    currentInterviewType:
      (row.currentInterviewType as Application['currentInterviewType']) ?? null,
    lastEventAt: row.lastEventAt,
    nextDeadlineAt: row.nextDeadlineAt ?? null,
    note: row.note ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function recomputeApplicationById(
  db: AppDatabase,
  applicationId: string,
): Promise<Application> {
  const applicationRows = await db
    .select()
    .from(application)
    .where(eq(application.id, applicationId))
    .limit(1);
  const applicationRow = applicationRows[0];
  if (!applicationRow) {
    throw new Error(`Application not found: ${applicationId}`);
  }

  const eventRows = await db
    .select()
    .from(event)
    .where(eq(event.applicationId, applicationId))
    .orderBy(asc(event.occurredAt));

  const derived = deriveApplicationState(
    eventRows.map((row) =>
      toDeriveEventInput({
        type: row.type as Parameters<typeof toDeriveEventInput>[0]['type'],
        occurredAt: row.occurredAt,
        round: row.round,
        interviewType: row.interviewType as Application['currentInterviewType'],
        deadlineAt: row.deadlineAt,
        scheduledAt: row.scheduledAt,
      }),
    ),
    { fallbackLastEventAt: applicationRow.createdAt },
  );

  const updated = {
    stage: derived.stage,
    ball: derived.ball,
    outcome: derived.outcome,
    currentRound: derived.currentRound,
    currentInterviewType: derived.currentInterviewType,
    lastEventAt: derived.lastEventAt,
    nextDeadlineAt: derived.nextDeadlineAt,
    updatedAt: new Date(),
  };

  await db.update(application).set(updated).where(eq(application.id, applicationId));

  return toApplication({ ...applicationRow, ...updated });
}

export async function recomputeAllApplications(db: AppDatabase): Promise<number> {
  const applications = await db.select({ id: application.id }).from(application);
  for (const row of applications) {
    await recomputeApplicationById(db, row.id);
  }
  return applications.length;
}
