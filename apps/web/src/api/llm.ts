import type {
  LlmCallLogDto,
  LlmDebugResponse,
  LlmPromptInfo,
} from '@job-harvester/shared';

const API_BASE = '/api';

export async function fetchLlmPrompts(): Promise<LlmPromptInfo[]> {
  const response = await fetch(`${API_BASE}/llm/prompts`);
  if (!response.ok) {
    throw new Error('加载 prompt 列表失败');
  }
  return response.json() as Promise<LlmPromptInfo[]>;
}

export async function fetchLlmLogs(): Promise<LlmCallLogDto[]> {
  const response = await fetch(`${API_BASE}/llm/logs`);
  if (!response.ok) {
    throw new Error('加载调用日志失败');
  }
  return response.json() as Promise<LlmCallLogDto[]>;
}

export async function runLlmDebug(input: {
  promptName: string;
  text: string;
}): Promise<LlmDebugResponse> {
  const response = await fetch(`${API_BASE}/llm/debug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('调试调用失败');
  }
  return response.json() as Promise<LlmDebugResponse>;
}
