import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  extractQuestionsFromMarkdown,
  normalizeQuestionText,
} from '../src/commands/yuque-markdown-parser';
import { createDatabase } from '../src/db/database.provider';
import { importCandidate, question } from '../src/db/schema';

function buildImportKey(sourceFile: string, text: string): string {
  const normalized = `${sourceFile}::${normalizeQuestionText(text)}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

describe('yuque markdown parser', () => {
  it('strips html font tags from headings and list items', () => {
    const content = [
      '## <font color="#ff0000">Redis 缓存穿透</font>',
      '- <font face="微软雅黑">MySQL 索引类型</font>',
      '1. <b>消息队列</b> 为什么选 Kafka',
    ].join('\n');

    const results = extractQuestionsFromMarkdown(content, '字节.md');
    expect(results.map((item) => item.text)).toEqual([
      'Redis 缓存穿透',
      'MySQL 索引类型',
      '消息队列 为什么选 Kafka',
    ]);
  });

  it('strips markdown inline formatting', () => {
    const content = '- **索引** 和 `B+树` [官方文档](https://example.com)';
    const results = extractQuestionsFromMarkdown(content, 'test.md');
    expect(results[0]?.text).toBe('索引 和 B+树 官方文档');
  });

  it('trims stray heading markers inside captured text', () => {
    const content = '### # 嵌套标题符号';
    const results = extractQuestionsFromMarkdown(content, 'test.md');
    expect(results[0]?.text).toBe('嵌套标题符号');
  });
});

describe('import-yuque idempotency', () => {
  let db: ReturnType<typeof createDatabase>;
  let tempDir: string;

  beforeEach(() => {
    db = createDatabase(':memory:');
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-yuque-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('skips duplicate import candidates by importKey', async () => {
    const sourceFile = '字节.md';
    const text = 'MySQL 索引有哪些类型';
    const importKey = buildImportKey(sourceFile, text);

    await db.insert(importCandidate).values({
      id: uuidv4(),
      text,
      category: null,
      companyId: null,
      applicationId: null,
      round: null,
      interviewType: null,
      sourceFile,
      importKey,
      status: 'PENDING',
      createdAt: new Date(),
    });

    const existing = await db
      .select({ id: importCandidate.id })
      .from(importCandidate)
      .where(eq(importCandidate.importKey, importKey))
      .limit(1);

    expect(existing).toHaveLength(1);

    const secondInsert = await db
      .select({ id: importCandidate.id })
      .from(importCandidate)
      .where(eq(importCandidate.importKey, importKey));

    expect(secondInsert).toHaveLength(1);
  });

  it('skips when question already exists with same importKey', async () => {
    const sourceFile = '腾讯.md';
    const text = 'Redis 持久化机制';
    const importKey = buildImportKey(sourceFile, text);
    const now = new Date();

    await db.insert(question).values({
      id: uuidv4(),
      text,
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

    const existing = await db
      .select({ id: question.id })
      .from(question)
      .where(eq(question.importKey, importKey))
      .limit(1);

    expect(existing).toHaveLength(1);
    expect(existing[0]?.id).toBeTruthy();
  });

  it('extracts headings from markdown files', () => {
    const mdPath = path.join(tempDir, 'sample.md');
    fs.writeFileSync(
      mdPath,
      '# MySQL 索引\n\n## Redis 缓存穿透\n\n- 消息队列选型\n',
      'utf8',
    );
    const content = fs.readFileSync(mdPath, 'utf8');
    const results = extractQuestionsFromMarkdown(content, 'sample.md');
    expect(results.map((item) => item.text)).toEqual([
      'MySQL 索引',
      'Redis 缓存穿透',
      '消息队列选型',
    ]);
  });
});
