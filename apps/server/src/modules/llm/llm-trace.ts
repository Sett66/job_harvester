import type { LlmCallLogDto } from '@job-harvester/shared';

/**
 * Langfuse 接入点（预留）。
 * 邮件抽取 prompt 会反复迭代，接入后可量化每次改动的效果。
 * 本片不引入观测 SDK，避免把薄适配层做成框架。
 */
export function traceLlmCall(_log: LlmCallLogDto): void {
  void _log;
}
