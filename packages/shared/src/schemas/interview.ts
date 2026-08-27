import { z } from 'zod';
import { interviewTypeSchema } from './application';

export const questionStatusSchema = z.enum([
  'NEW',
  'WEAK',
  'REVIEWING',
  'MASTERED',
]);

export const questionSourceSchema = z.enum([
  'INTERVIEW',
  'IMPORT',
  'GENERATED',
]);

export type QuestionStatus = z.infer<typeof questionStatusSchema>;
export type QuestionSource = z.infer<typeof questionSourceSchema>;

export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  NEW: '未掌握',
  WEAK: '薄弱',
  REVIEWING: '复习中',
  MASTERED: '已掌握',
};

export const QUESTION_SOURCE_LABELS: Record<QuestionSource, string> = {
  INTERVIEW: '面试',
  IMPORT: '导入',
  GENERATED: '生成',
};

export const questionSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1),
  category: z.string().nullable().optional(),
  applicationId: z.string().uuid().nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
  interviewNoteId: z.string().uuid().nullable().optional(),
  round: z.number().int().min(1).nullable().optional(),
  interviewType: interviewTypeSchema.nullable().optional(),
  askedAt: z.coerce.date().nullable().optional(),
  myAnswer: z.string().nullable().optional(),
  referenceAnswer: z.string().nullable().optional(),
  selfRating: z.number().int().min(1).max(5).nullable().optional(),
  status: questionStatusSchema,
  source: questionSourceSchema,
  importKey: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Question = z.infer<typeof questionSchema>;

export const interviewNoteSchema = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  eventId: z.string().uuid().nullable().optional(),
  mdPath: z.string().min(1),
  rawDump: z.string().min(1),
  summary: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
});

export type InterviewNote = z.infer<typeof interviewNoteSchema>;

/** LLM 偶发把 weakPoint 输出成 boolean，统一收成可选字符串 */
const llmOptionalTextSchema = z.preprocess((value) => {
  if (value == null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value ? '存在薄弱点' : undefined;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}, z.string().optional());

/** LLM 偶发用 question / title 等字段名代替 text，统一归一 */
function normalizeStructuredQuestionInput(value: unknown): unknown {
  if (typeof value !== 'object' || value == null) {
    return value;
  }
  const obj = value as Record<string, unknown>;
  const textCandidate =
    obj.text ?? obj.question ?? obj.title ?? obj.content ?? obj.name;
  return {
    ...obj,
    text: textCandidate,
  };
}

const structuredQuestionTextSchema = z.preprocess((value) => {
  if (value == null || value === '') {
    return undefined;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}, z.string().min(1).refine((value) => value !== 'undefined', {
  message: '题目文本无效',
}));

export const structuredQuestionSchema = z.preprocess(
  normalizeStructuredQuestionInput,
  z.object({
    text: structuredQuestionTextSchema,
    category: llmOptionalTextSchema,
    myAnswer: llmOptionalTextSchema,
    weakPoint: llmOptionalTextSchema,
  }),
);

export type StructuredQuestion = z.infer<typeof structuredQuestionSchema>;

export const structureDebriefOutputSchema = z.object({
  summary: z.string().optional(),
  questions: z.array(structuredQuestionSchema).min(1),
});

export type StructureDebriefOutput = z.infer<typeof structureDebriefOutputSchema>;

export const probeMessageSchema = z.object({
  role: z.enum(['assistant', 'user']),
  content: z.string().min(1),
});

export type ProbeMessage = z.infer<typeof probeMessageSchema>;

export const probeOutputSchema = z.object({
  reply: z.string(),
  shouldContinue: z.boolean(),
  updatedQuestions: z.array(structuredQuestionSchema).optional(),
});

export type ProbeOutput = z.infer<typeof probeOutputSchema>;

export const startDebriefSchema = z.object({
  rawDump: z.string().min(1),
  applicationId: z.string().uuid(),
  eventId: z.string().uuid().optional(),
});

export type StartDebriefInput = z.infer<typeof startDebriefSchema>;

export const probeDebriefSchema = z.object({
  rawDump: z.string().min(1),
  questions: z.array(structuredQuestionSchema).min(1),
  messages: z.array(probeMessageSchema),
  round: z.number().int().min(0).max(3),
});

export type ProbeDebriefInput = z.infer<typeof probeDebriefSchema>;

export const finalizeDebriefSchema = z.object({
  rawDump: z.string().min(1),
  applicationId: z.string().uuid(),
  eventId: z.string().uuid().optional(),
  summary: z.string().optional(),
  questions: z.array(structuredQuestionSchema).min(1),
});

export type FinalizeDebriefInput = z.infer<typeof finalizeDebriefSchema>;

export const updateQuestionSchema = z
  .object({
    text: z.string().min(1).optional(),
    category: z.string().nullable().optional(),
    myAnswer: z.string().nullable().optional(),
    selfRating: z.number().int().min(1).max(5).nullable().optional(),
    status: questionStatusSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: '至少提供一个要更新的字段',
  });

export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

export const questionFilterSchema = z.object({
  companyId: z.string().uuid().optional(),
  category: z.string().optional(),
  status: questionStatusSchema.optional(),
  applicationId: z.string().uuid().optional(),
});

export type QuestionFilter = z.infer<typeof questionFilterSchema>;

export const importCandidateSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1),
  category: z.string().nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
  applicationId: z.string().uuid().nullable().optional(),
  round: z.number().int().min(1).nullable().optional(),
  interviewType: interviewTypeSchema.nullable().optional(),
  sourceFile: z.string().min(1),
  importKey: z.string().min(1),
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED']),
  createdAt: z.coerce.date(),
});

export type ImportCandidate = z.infer<typeof importCandidateSchema>;

export const confirmImportCandidateSchema = z.object({
  selfRating: z.number().int().min(1).max(5).nullable().optional(),
  status: questionStatusSchema.optional(),
});

export type ConfirmImportCandidateInput = z.infer<
  typeof confirmImportCandidateSchema
>;
