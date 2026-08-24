import { Injectable, Logger } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { redactSensitiveText } from './redact';

export type LlmCallResult<T> =
  | { ok: true; data: T; usage?: { promptTokens: number; completionTokens: number } }
  | { ok: false; error: string };

export type LlmCallLog = {
  promptName: string;
  durationMs: number;
  success: boolean;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
};

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly logs: LlmCallLog[] = [];

  getCallLogs(): LlmCallLog[] {
    return [...this.logs];
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

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const raw = await this.callModel(redactedSystem, redactedUser);
        const parsedJson = this.extractJson(raw);
        const validated = options.schema.safeParse(parsedJson);
        if (validated.success) {
          this.recordLog({
            promptName: options.promptName,
            durationMs: Date.now() - startedAt,
            success: true,
          });
          return { ok: true, data: validated.data };
        }
        if (attempt === 1) {
          const error = validated.error.message;
          this.recordLog({
            promptName: options.promptName,
            durationMs: Date.now() - startedAt,
            success: false,
            error,
          });
          return { ok: false, error };
        }
      } catch (error) {
        if (attempt === 1) {
          const message = error instanceof Error ? error.message : String(error);
          this.recordLog({
            promptName: options.promptName,
            durationMs: Date.now() - startedAt,
            success: false,
            error: message,
          });
          return { ok: false, error: message };
        }
      }
    }

    return { ok: false, error: '未知错误' };
  }

  private async callModel(system: string, user: string): Promise<string> {
    const apiKey = process.env.LLM_API_KEY;
    const baseURL = process.env.LLM_BASE_URL ?? 'https://api.deepseek.com';
    const model = process.env.LLM_MODEL ?? 'deepseek-chat';

    if (!apiKey) {
      return this.mockResponse(system, user);
    }

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM 请求失败: ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LLM 返回空内容');
    }
    return content;
  }

  private mockResponse(system: string, user: string): string {
    if (system.includes('邮件解析') || system.includes('extract-mail')) {
      return this.mockExtractMail(user);
    }

    if (system.includes('追问')) {
      const hasMissingAnswer = user.includes('"myAnswer"') && !user.includes('"myAnswer": "');
      if (hasMissingAnswer) {
        return JSON.stringify({
          reply: '你当时是怎么回答的？哪个点卡住了？',
          shouldContinue: true,
        });
      }
      return JSON.stringify({
        reply: '',
        shouldContinue: false,
      });
    }

    const segments = user
      .split(/[、，,；;\n]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 2);

    const questions = segments
      .filter((part) => /问|索引|缓存|Kafka|Redis|MySQL|项目|算法|设计/.test(part))
      .map((part) => {
        const weakPoint = /答崩|卡住|不会|忘了/.test(part) ? part : undefined;
        const text = part
          .replace(/^(问了|还问了|第三个)/, '')
          .replace(/我项目那个/, '项目里')
          .trim();
        return {
          text: text.length > 0 ? text : part,
          category: /项目|Kafka|消息队列/.test(part)
            ? '项目'
            : /MySQL|Redis|索引|缓存/.test(part)
              ? '基础'
              : undefined,
          weakPoint,
        };
      });

    if (questions.length === 0) {
      return JSON.stringify({
        summary: '面试复盘',
        questions: [{ text: user.slice(0, 200), category: '其他' }],
      });
    }

    return JSON.stringify({
      summary: '面试复盘',
      questions,
    });
  }

  private mockExtractMail(user: string): string {
    let payload: {
      subject?: string;
      fromAddress?: string;
      bodyText?: string;
      receivedAt?: string;
    } = {};
    try {
      payload = JSON.parse(user) as typeof payload;
    } catch {
      payload = { bodyText: user };
    }

    const body = payload.bodyText ?? '';
    const subject = payload.subject ?? '';
    const combined = `${subject}\n${body}`;

    const deadlineMatch = combined.match(
      /(?:请于|截止|前完成|之前完成)[^\d]*(\d{1,2})月(\d{1,2})日(?:[^\d]*(\d{1,2}):(\d{2}))?/,
    );
    let deadlineAt: string | null = null;
    if (deadlineMatch) {
      const month = Number(deadlineMatch[1]);
      const day = Number(deadlineMatch[2]);
      const hour = deadlineMatch[3] ? Number(deadlineMatch[3]) : 23;
      const minute = deadlineMatch[4] ? Number(deadlineMatch[4]) : 59;
      deadlineAt = new Date(Date.UTC(2026, month - 1, day, hour - 8, minute)).toISOString();
    }

    const eventType = /笔试/.test(combined)
      ? 'EXAM_INVITE'
      : /测评/.test(combined)
        ? 'ASSESSMENT_INVITE'
        : /面试/.test(combined)
          ? 'INTERVIEW_SCHEDULED'
          : /offer/i.test(combined)
            ? 'OFFER_INTENT'
            : 'NOTE';

    const companyMatch =
      combined.match(/([\u4e00-\u9fa5A-Za-z]+)[\s\-－—]+([\u4e00-\u9fa5A-Za-z]+)/) ??
      combined.match(/([\u4e00-\u9fa5]{2,8})/);
    const companyName = companyMatch?.[1] ?? '未知公司';
    const businessUnit = companyMatch?.[2];

    const confidence = /字节|腾讯|美团|阿里/.test(combined) ? 0.92 : 0.55;

    return JSON.stringify({
      companyName,
      businessUnit,
      position: undefined,
      eventType,
      occurredAt: payload.receivedAt ?? new Date().toISOString(),
      deadlineAt:
        deadlineAt ??
        (eventType === 'EXAM_INVITE' || eventType === 'ASSESSMENT_INVITE'
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          : null),
      confidence,
    });
  }

  private extractJson(raw: string): unknown {
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

  private recordLog(entry: LlmCallLog): void {
    this.logs.push(entry);
    if (entry.success) {
      this.logger.log(
        `${entry.promptName} 成功 (${entry.durationMs}ms)`,
      );
    } else {
      this.logger.warn(
        `${entry.promptName} 失败 (${entry.durationMs}ms): ${entry.error}`,
      );
    }
  }
}
