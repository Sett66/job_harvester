import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { backfillQuestionCompanies } from '../src/modules/import/backfill-question-companies';
import { createDatabase } from '../src/db/database.provider';
import {
  buildCompanyNameCandidates,
  parseSourceFileBasename,
} from '../src/modules/import/source-file-company';
import { company, companyAlias, importCandidate, question } from '../src/db/schema';
import { matchCompanyByAlias } from '../src/modules/extraction/alias-match';

describe('source-file-company', () => {
  it('builds candidates from yuque filenames', () => {
    expect(buildCompanyNameCandidates('字节-豆包.md')).toContain('字节跳动');
    expect(parseSourceFileBasename('subdir/腾讯元宝.md')).toBe('腾讯元宝');
  });

  it('matches company via alias from source filename', async () => {
    const db = createDatabase(':memory:');
    const companyId = uuidv4();
    await db.insert(company).values({
      id: companyId,
      canonicalName: '字节跳动',
      industry: null,
      website: null,
      note: null,
      createdAt: new Date(),
    });
    await db.insert(companyAlias).values({
      id: uuidv4(),
      companyId,
      alias: '字节',
      source: 'MANUAL',
    });

    const match = await matchCompanyByAlias(db, '字节');
    expect(match?.companyId).toBe(companyId);
  });
});

describe('backfillQuestionCompanies', () => {
  it('fills companyId for imported questions from source file', async () => {
    const db = createDatabase(':memory:');
    const companyId = uuidv4();
    const importKey = 'test-import-key';
    const now = new Date();

    await db.insert(company).values({
      id: companyId,
      canonicalName: '字节跳动',
      industry: null,
      website: null,
      note: null,
      createdAt: now,
    });
    await db.insert(companyAlias).values({
      id: uuidv4(),
      companyId,
      alias: '字节-豆包',
      source: 'IMPORT',
    });
    await db.insert(importCandidate).values({
      id: uuidv4(),
      text: 'Redis 缓存穿透',
      category: null,
      companyId: null,
      applicationId: null,
      round: null,
      interviewType: null,
      sourceFile: '字节-豆包.md',
      importKey,
      status: 'CONFIRMED',
      createdAt: now,
    });
    await db.insert(question).values({
      id: uuidv4(),
      text: 'Redis 缓存穿透',
      category: null,
      applicationId: null,
      companyId: null,
      interviewNoteId: null,
      round: null,
      interviewType: null,
      askedAt: null,
      myAnswer: null,
      referenceAnswer: null,
      selfRating: null,
      status: 'NEW',
      source: 'IMPORT',
      importKey,
      createdAt: now,
      updatedAt: now,
    });

    const result = await backfillQuestionCompanies(db);
    expect(result.updatedQuestions).toBe(1);

    const rows = await db
      .select({ companyId: question.companyId })
      .from(question)
      .where(eq(question.importKey, importKey));
    expect(rows[0]?.companyId).toBe(companyId);
  });
});
