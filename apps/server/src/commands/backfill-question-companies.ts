import path from 'node:path';
import { createDatabase } from '../db/database.provider';
import { backfillQuestionCompanies } from '../modules/import/backfill-question-companies';

async function main() {
  const dbPath =
    process.env.DATABASE_PATH ??
    path.resolve(process.cwd(), '../../data/app.db');
  const db = createDatabase(dbPath);
  const result = await backfillQuestionCompanies(db);

  console.log(
    [
      `扫描 ${result.scanned} 条待补齐记录`,
      `更新题目 ${result.updatedQuestions} 条`,
      `更新导入候选 ${result.updatedCandidates} 条`,
      `未能匹配 ${result.unmatchedFiles.length} 个来源文件`,
    ].join('，'),
  );

  if (result.unmatchedFiles.length > 0) {
    console.log('\n未能匹配公司的来源文件：');
    for (const file of result.unmatchedFiles) {
      console.log(`- ${file}`);
    }
    console.log(
      '\n可在系统中为公司添加别名（如「字节」→ 字节跳动），然后重新运行本命令。',
    );
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
