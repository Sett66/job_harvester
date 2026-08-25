import { debugExtractOutputSchema } from '@job-harvester/shared';
import { describe, expect, it } from 'vitest';
import {
  LlmService,
  type LlmChatClient,
} from '../src/modules/llm/llm.service';

const validPayload = {
  companyName: '字节跳动',
  position: '后端开发',
  salary: '25k-40k',
  summary: '秋招内推',
};

function schemaOptions() {
  return {
    promptName: 'debug-extract',
    system: 'extract json',
    user: '字节跳动 后端开发 25k-40k 联系 13800138000',
    schema: debugExtractOutputSchema,
  };
}

describe('LlmService', () => {
  it('returns structured JSON when schema validates', async () => {
    const client: LlmChatClient = {
      complete: async () => ({
        content: JSON.stringify(validPayload),
        usage: { promptTokens: 12, completionTokens: 8 },
      }),
    };
    const service = new LlmService(client);
    const result = await service.completeJson(schemaOptions());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.companyName).toBe('字节跳动');
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 8 });

    const log = service.getCallLogs()[0];
    expect(log?.promptName).toBe('debug-extract');
    expect(log?.success).toBe(true);
    expect(log?.promptTokens).toBe(12);
    expect(log?.completionTokens).toBe(8);
    expect(log?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('retries once after Zod validation failure then succeeds', async () => {
    let attempts = 0;
    const client: LlmChatClient = {
      complete: async () => {
        attempts += 1;
        if (attempts === 1) {
          return { content: JSON.stringify({ nope: true }) };
        }
        return { content: JSON.stringify(validPayload) };
      },
    };
    const service = new LlmService(client);
    const result = await service.completeJson(schemaOptions());

    expect(attempts).toBe(2);
    expect(result.ok).toBe(true);
  });

  it('returns a failure result instead of throwing after retry is exhausted', async () => {
    const client: LlmChatClient = {
      complete: async () => ({ content: JSON.stringify({ nope: true }) }),
    };
    const service = new LlmService(client);
    const result = await service.completeJson(schemaOptions());

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.length).toBeGreaterThan(0);
    expect(service.getCallLogs()[0]?.success).toBe(false);
  });

  it('redacts phone numbers before sending text to the model', async () => {
    let seenUser = '';
    const client: LlmChatClient = {
      complete: async ({ user }) => {
        seenUser = user;
        return { content: JSON.stringify(validPayload) };
      },
    };
    const service = new LlmService(client);
    await service.completeJson(schemaOptions());

    expect(seenUser).toContain('[PHONE]');
    expect(seenUser).not.toContain('13800138000');
    expect(seenUser).toContain('字节跳动');
    expect(seenUser).toContain('后端开发');
    expect(seenUser).toContain('25k-40k');
  });
});
