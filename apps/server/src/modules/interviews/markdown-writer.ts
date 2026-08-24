import fs from 'node:fs';
import path from 'node:path';
import type { StructuredQuestion } from '@job-harvester/shared';

function resolveNotesDir(): string {
  const configured = process.env.NOTES_DIR;
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(process.cwd(), '../../data/notes');
}

export function writeInterviewNoteMarkdown(options: {
  noteId: string;
  companyName: string;
  applicationLabel: string;
  rawDump: string;
  summary?: string | null;
  questions: StructuredQuestion[];
  createdAt: Date;
}): string {
  const notesDir = resolveNotesDir();
  fs.mkdirSync(notesDir, { recursive: true });

  const filename = `${options.createdAt.toISOString().slice(0, 10)}-${options.noteId.slice(0, 8)}.md`;
  const mdPath = path.join(notesDir, filename);

  const lines = [
    `# 面试复盘 — ${options.companyName}`,
    '',
    `- 投递：${options.applicationLabel}`,
    `- 记录时间：${options.createdAt.toISOString()}`,
    '',
  ];

  if (options.summary) {
    lines.push('## 摘要', '', options.summary, '');
  }

  lines.push('## 原文', '', '```', options.rawDump, '```', '', '## 题目', '');

  for (const [index, question] of options.questions.entries()) {
    lines.push(`### ${index + 1}. ${question.text}`);
    if (question.category) {
      lines.push(`- 分类：${question.category}`);
    }
    if (question.myAnswer) {
      lines.push(`- 我的回答：${question.myAnswer}`);
    }
    if (question.weakPoint) {
      lines.push(`- 薄弱点：${question.weakPoint}`);
    }
    lines.push('');
  }

  fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');
  return mdPath;
}

export function readInterviewNoteMarkdown(mdPath: string): string {
  return fs.readFileSync(mdPath, 'utf8');
}
