export const DEBUG_EXTRACT_PROMPT_NAME = 'debug-extract';

export const DEBUG_EXTRACT_SYSTEM = `你是招聘信息抽取助手。从用户文本中抽取结构化字段，只输出 JSON。

字段：
- companyName: 公司名称（必填）
- position: 岗位名称，没有则 null
- salary: 薪资原文，没有则 null
- summary: 一句话摘要

规则：
1. 公司名、岗位名、薪资必须按原文保留，不要改写或删除
2. 只输出 JSON，不要 markdown 或解释`;

export function buildDebugExtractUserPrompt(text: string): string {
  return `请从以下文本抽取字段：\n\n${text}`;
}
