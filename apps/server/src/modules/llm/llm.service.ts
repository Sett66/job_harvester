import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { LlmCallLogDto } from '@job-harvester/shared';
import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import type { ZodSchema } from 'zod';
import { getLlmEnv } from '../../config/env.schema';
import { traceLlmCall } from './llm-trace';
import { redactSensitiveText } from './redact';

export const LLM_CHAT_CLIENT = Symbol('LLM_CHAT_CLIENT');

export type LlmUsage = {
  promptTokens: number;
  completionTokens: number;
};

export type LlmChatCompletion = {
  content: string;
  usage?: LlmUsage;
};

export type LlmChatClient = {
  complete(input: { system: string; user: string }): Promise<LlmChatCompletion>;
};

export type LlmCallResult<T> =
  | {
      ok: true;
      data: T;
      raw: string;
      redactedUser: string;
      usage?: LlmUsage;
    }
  | {
      ok: false;
      error: string;
      raw?: string;
      redactedUser: string;
    };

const MAX_MEMORY_LOGS = 200;

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly logs: LlmCallLogDto[] = [];
  private openaiClient: OpenAI | undefined;

  constructor(
    @Optional()
    @Inject(LLM_CHAT_CLIENT)
    private readonly injectedClient?: LlmChatClient,
  ) {}

  getCallLogs(): LlmCallLogDto[] {
    return [...this.logs].reverse();
  }

  async completeJson<T>(options: {
    promptName: string;
    system: string;
    user: string;
    schema: ZodSchema<T>;
  }): Promise<LlmCallResult<T>> {
    const startedAt = Date.now();
    const redactedUser = redactSensitiveText(options.user);
    const redactedSystem = redactSensitiveText(options.system);
    let promptTokens = 0;
    let completionTokens = 0;
    let lastRaw: string | undefined;
    let lastError = '未知错误';

    const env = getLlmEnv();
    if (!this.injectedClient && !env.LLM_API_KEY) {
      return this.finishFailure({
        promptName: options.promptName,
        startedAt,
        redactedUser,
        error: 'LLM_API_KEY 未配置',
      });
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const userForAttempt =
        attempt === 0 || !lastRaw
          ? redactedUser
          : `${redactedUser}\n\n[系统] 上次输出未通过校验：${lastError}\n请只输出符合 schema 的 JSON。`;

      try {
        const completion = await this.callModel(redactedSystem, userForAttempt);
        lastRaw = completion.content;
        if (completion.usage) {
          promptTokens += completion.usage.promptTokens;
          completionTokens += completion.usage.completionTokens;
        }

        const parsedJson = extractJson(completion.content);
        const validated = options.schema.safeParse(parsedJson);
        if (validated.success) {
          const usage = toUsage(promptTokens, completionTokens);
          this.recordLog({
            promptName: options.promptName,
            durationMs: Date.now() - startedAt,
            success: true,
            promptTokens: usage?.promptTokens,
            completionTokens: usage?.completionTokens,
            createdAt: new Date().toISOString(),
          });
          return {
            ok: true,
            data: validated.data,
            raw: completion.content,
            redactedUser,
            usage,
          };
        }

        lastError = validated.error.message;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    return this.finishFailure({
      promptName: options.promptName,
      startedAt,
      redactedUser,
      error: lastError,
      raw: lastRaw,
      promptTokens,
      completionTokens,
    });
  }

  private finishFailure(input: {
    promptName: string;
    startedAt: number;
    redactedUser: string;
    error: string;
    raw?: string;
    promptTokens?: number;
    completionTokens?: number;
  }): LlmCallResult<never> {
    const usage = toUsage(input.promptTokens ?? 0, input.completionTokens ?? 0);
    this.recordLog({
      promptName: input.promptName,
      durationMs: Date.now() - input.startedAt,
      success: false,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
      error: input.error,
      createdAt: new Date().toISOString(),
    });
    return {
      ok: false,
      error: input.error,
      raw: input.raw,
      redactedUser: input.redactedUser,
    };
  }

  private async callModel(system: string, user: string): Promise<LlmChatCompletion> {
    if (this.injectedClient) {
      return this.injectedClient.complete({ system, user });
    }

    const env = getLlmEnv();
    if (!env.LLM_API_KEY) {
      throw new Error('LLM_API_KEY 未配置');
    }

    if (!this.openaiClient) {
      this.openaiClient = new OpenAI({
        apiKey: env.LLM_API_KEY,
        baseURL: env.LLM_BASE_URL,
      });
    }

    const completion = await this.openaiClient.chat.completions.create({
      model: env.LLM_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('LLM 返回空内容');
    }

    return {
      content,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
          }
        : undefined,
    };
  }

  private recordLog(entry: LlmCallLogDto): void {
    this.logs.push(entry);
    if (this.logs.length > MAX_MEMORY_LOGS) {
      this.logs.splice(0, this.logs.length - MAX_MEMORY_LOGS);
    }
    persistCallLog(entry);
    traceLlmCall(entry);

    if (entry.success) {
      this.logger.log(
        `${entry.promptName} 成功 (${entry.durationMs}ms, tokens=${entry.promptTokens ?? 0}+${entry.completionTokens ?? 0})`,
      );
    } else {
      this.logger.warn(
        `${entry.promptName} 失败 (${entry.durationMs}ms): ${entry.error}`,
      );
    }
  }
}

function toUsage(promptTokens: number, completionTokens: number): LlmUsage | undefined {
  if (promptTokens <= 0 && completionTokens <= 0) {
    return undefined;
  }
  return { promptTokens, completionTokens };
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match?.[1]) {
    return JSON.parse(match[1]);
  }
  throw new Error('无法解析 LLM JSON 输出');
}

function persistCallLog(entry: LlmCallLogDto): void {
  if (process.env.VITEST) {
    return;
  }
  try {
    const filePath = path.resolve(process.cwd(), '../../data/llm-calls.jsonl');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // 落盘失败不影响调用
  }
}
