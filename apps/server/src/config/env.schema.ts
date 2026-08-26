import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

function blankToUndefined(value: unknown): unknown {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
}

export const llmEnvSchema = z.object({
  LLM_BASE_URL: z.preprocess(
    blankToUndefined,
    z.string().min(1).default('https://api.deepseek.com'),
  ),
  LLM_API_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  LLM_MODEL: z.preprocess(
    blankToUndefined,
    z.string().min(1).default('deepseek-chat'),
  ),
});

export type LlmEnv = z.infer<typeof llmEnvSchema>;

let envFileLoaded = false;

function loadDotEnv(): void {
  if (envFileLoaded) {
    return;
  }
  envFileLoaded = true;

  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) {
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      const eq = line.indexOf('=');
      if (eq <= 0) {
        continue;
      }
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    break;
  }
}

export function getLlmEnv(): LlmEnv {
  loadDotEnv();
  return llmEnvSchema.parse({
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_MODEL: process.env.LLM_MODEL,
  });
}
