import { z } from 'zod';

export const debugExtractOutputSchema = z.object({
  companyName: z.string().min(1),
  position: z.string().nullable(),
  salary: z.string().nullable(),
  summary: z.string(),
});

export type DebugExtractOutput = z.infer<typeof debugExtractOutputSchema>;

export const llmCallLogSchema = z.object({
  promptName: z.string(),
  durationMs: z.number(),
  success: z.boolean(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
});

export type LlmCallLogDto = z.infer<typeof llmCallLogSchema>;

export const llmPromptInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
});

export type LlmPromptInfo = z.infer<typeof llmPromptInfoSchema>;

export const llmDebugRequestSchema = z.object({
  promptName: z.string().min(1),
  text: z.string().min(1),
});

export type LlmDebugRequest = z.infer<typeof llmDebugRequestSchema>;

export const llmDebugResponseSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  raw: z.string().optional(),
  redactedUser: z.string(),
  log: llmCallLogSchema,
});

export type LlmDebugResponse = z.infer<typeof llmDebugResponseSchema>;
