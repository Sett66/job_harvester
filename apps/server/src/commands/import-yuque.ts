import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { createDatabase } from '../db/database.provider';
import { importCandidate, question } from '../db/schema';

function normalizeQuestionText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function buildImportKey(sourceFile: string, text: string): string {
  const normalized = `${sourceFile}::${normalizeQuestionText(text)}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function extractQuestionsFromMarkdown(content: string, sourceFile: string) {
  const lines = content.split(/\r?\n/);
  const results: Array<{ text: string; category?: string }> = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    const listMatch = line.match(/^[-*+]\s+(.+)$/);
    const numberedMatch = line.match(/^\d+[.)]\s+(.+)$/);

    const rawText =
      headingMatch?.[1] ?? listMatch?.[1] ?? numberedMatch?.[1] ?? null;
    if (!rawText) {
      continue;
    }

    const text = normalizeQuestionText(rawText);
    if (text.length < 3) {
      continue;
    }
    if (/^(目录|摘要|前言|附录|tags?|标签)/i.test(text)) {
      continue;
    }

    results.push({ text });
  }

  if (results.length === 0) {
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((part) => normalizeQuestionText(part))
      .filter((part) => part.length >= 3);
    for (const paragraph of paragraphs.slice(0, 20)) {
      results.push({ text: paragraph.slice(0, 500) });
    }
  }

  return results.map((item) => ({ ...item, sourceFile }));
}

async function main() {
  const dirArgIndex = process.argv.indexOf('--dir');
  const dir =
    dirArgIndex >= 0 ? process.argv[dirArgIndex + 1] : process.argv[2];
  if (!dir) {
    console.error('用法: pnpm --filter server import:yuque -- --dir "<目录>"');
    process.exit(1);
  }

  const resolvedDir = path.resolve(dir);
  if (!fs.existsSync(resolvedDir)) {
    console.error(`目录不存在: ${resolvedDir}`);
    process.exit(1);
  }

  const dbPath =
    process.env.DATABASE_PATH ??
    path.resolve(process.cwd(), '../../data/app.db');
  const db = createDatabase(dbPath);

  const files = fs
    .readdirSync(resolvedDir, { recursive: true })
    .flatMap((entry) => {
      const fullPath =
        typeof entry === 'string'
          ? path.join(resolvedDir, entry)
          : path.join(resolvedDir, String(entry));
      return fullPath.endsWith('.md') ? [fullPath] : [];
    });

  let created = 0;
  let skipped = 0;

  for (const filePath of files) {
    const relativePath = path.relative(resolvedDir, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const extracted = extractQuestionsFromMarkdown(content, relativePath);

    for (const item of extracted) {
      const importKey = buildImportKey(item.sourceFile, item.text);

      const existingQuestion = await db
        .select({ id: question.id })
        .from(question)
        .where(eq(question.importKey, importKey))
        .limit(1);
      if (existingQuestion[0]) {
        skipped += 1;
        continue;
      }

      const existingCandidate = await db
        .select({ id: importCandidate.id, status: importCandidate.status })
        .from(importCandidate)
        .where(eq(importCandidate.importKey, importKey))
        .limit(1);
      if (existingCandidate[0]) {
        skipped += 1;
        continue;
      }

      await db.insert(importCandidate).values({
        id: uuidv4(),
        text: item.text,
        category: item.category ?? null,
        companyId: null,
        applicationId: null,
        round: null,
        interviewType: null,
        sourceFile: item.sourceFile,
        importKey,
        status: 'PENDING',
        createdAt: new Date(),
      });
      created += 1;
    }
  }

  console.log(
    `语雀导入完成：扫描 ${files.length} 个文件，新增 ${created} 条候选，跳过 ${skipped} 条（已存在）`,
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
