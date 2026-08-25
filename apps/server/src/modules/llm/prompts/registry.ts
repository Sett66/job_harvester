import {
  debugExtractOutputSchema,
  mailExtractionOutputSchema,
} from '@job-harvester/shared';
import type { ZodTypeAny } from 'zod';
import {
  DEBUG_EXTRACT_PROMPT_NAME,
  DEBUG_EXTRACT_SYSTEM,
  buildDebugExtractUserPrompt,
} from './debug-extract';
import {
  EXTRACT_MAIL_PROMPT_NAME,
  EXTRACT_MAIL_SYSTEM,
  buildExtractMailUserPrompt,
} from './extract-mail';

export type RegisteredPrompt = {
  name: string;
  description: string;
  system: string;
  schema: ZodTypeAny;
  buildUser: (text: string) => string;
};

export const PROMPT_REGISTRY: RegisteredPrompt[] = [
  {
    name: DEBUG_EXTRACT_PROMPT_NAME,
    description: '测试抽取：公司 / 岗位 / 薪资（验证脱敏与结构化输出）',
    system: DEBUG_EXTRACT_SYSTEM,
    schema: debugExtractOutputSchema,
    buildUser: buildDebugExtractUserPrompt,
  },
  {
    name: EXTRACT_MAIL_PROMPT_NAME,
    description: '邮件抽取（JH-09）',
    system: EXTRACT_MAIL_SYSTEM,
    schema: mailExtractionOutputSchema,
    buildUser: (text) =>
      buildExtractMailUserPrompt({
        subject: '(debug)',
        fromAddress: 'debug@local',
        receivedAt: new Date(),
        bodyText: text,
      }),
  },
];

export function listPromptInfo(): Array<{ name: string; description: string }> {
  return PROMPT_REGISTRY.map(({ name, description }) => ({ name, description }));
}

export function getPromptByName(name: string): RegisteredPrompt | undefined {
  return PROMPT_REGISTRY.find((prompt) => prompt.name === name);
}
