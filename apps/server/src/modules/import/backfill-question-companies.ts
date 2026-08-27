import { and, eq, isNull } from 'drizzle-orm';
import type { AppDatabase } from '../../db/database.provider';
import { importCandidate, question } from '../../db/schema';
import { resolveCompanyFromSourceFile } from './source-file-company';

async function resolveCompanyIdWithCache(
  db: AppDatabase,
  sourceFile: string,
  cache: Map<string, string | null>,
): Promise<string | null> {
  if (!cache.has(sourceFile)) {
    const resolved = await resolveCompanyFromSourceFile(db, sourceFile);
    cache.set(sourceFile, resolved?.companyId ?? null);
  }
  return cache.get(sourceFile) ?? null;
}

export async function backfillQuestionCompanies(db: AppDatabase) {
  const companyCache = new Map<string, string | null>();
  const unmatchedFiles = new Set<string>();
  let updatedQuestions = 0;
  let updatedCandidates = 0;

  const questionsToFix = await db
    .select({
      id: question.id,
      sourceFile: importCandidate.sourceFile,
      candidateCompanyId: importCandidate.companyId,
    })
    .from(question)
    .innerJoin(importCandidate, eq(question.importKey, importCandidate.importKey))
    .where(and(eq(question.source, 'IMPORT'), isNull(question.companyId)));

  for (const row of questionsToFix) {
    const companyId =
      row.candidateCompanyId ??
      (await resolveCompanyIdWithCache(db, row.sourceFile, companyCache));
    if (!companyId) {
      unmatchedFiles.add(row.sourceFile);
      continue;
    }

    await db
      .update(question)
      .set({ companyId, updatedAt: new Date() })
      .where(eq(question.id, row.id));
    updatedQuestions += 1;
  }

  const candidatesToFix = await db
    .select({
      id: importCandidate.id,
      sourceFile: importCandidate.sourceFile,
    })
    .from(importCandidate)
    .where(isNull(importCandidate.companyId));

  for (const row of candidatesToFix) {
    const companyId = await resolveCompanyIdWithCache(
      db,
      row.sourceFile,
      companyCache,
    );
    if (!companyId) {
      unmatchedFiles.add(row.sourceFile);
      continue;
    }

    await db
      .update(importCandidate)
      .set({ companyId })
      .where(eq(importCandidate.id, row.id));
    updatedCandidates += 1;
  }

  return {
    scanned: questionsToFix.length + candidatesToFix.length,
    updatedQuestions,
    updatedCandidates,
    skipped: unmatchedFiles.size,
    unmatchedFiles: [...unmatchedFiles].sort(),
  };
}
