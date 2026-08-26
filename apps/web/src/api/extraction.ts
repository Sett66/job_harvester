import type { ExtractionBatchResult } from '@job-harvester/shared';

const API_BASE = '/api';

async function readJson<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const detail = Array.isArray(body?.message)
      ? body.message.join('；')
      : body?.message;
    throw new Error(detail ?? fallbackMessage);
  }
  return response.json() as Promise<T>;
}

export async function runExtraction(): Promise<ExtractionBatchResult> {
  const response = await fetch(`${API_BASE}/extraction/run`, {
    method: 'POST',
  });
  return readJson(response, '批量抽取失败');
}
