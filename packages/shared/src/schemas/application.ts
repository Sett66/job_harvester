import { z } from 'zod';

export const stageSchema = z.enum([
  'APPLIED',
  'SCREENING',
  'ASSESSMENT',
  'WRITTEN_EXAM',
  'INTERVIEW',
  'OFFER',
  'CLOSED',
]);

export const ballSchema = z.enum(['ME', 'THEM']);

export const outcomeSchema = z.enum([
  'REJECTED',
  'WITHDRAWN',
  'TALENT_POOL',
  'ASSUMED_DEAD',
]);

export const interviewTypeSchema = z.enum([
  'TECH',
  'MANAGER',
  'HR',
  'CROSS',
  'GROUP',
  'AI',
]);

export const CHANNELS = ['官网', '内推', '牛客', 'BOSS', '被捞'] as const;

export const channelSchema = z.enum(CHANNELS);

export const aliasSourceSchema = z.enum(['MANUAL', 'CONFIRMED', 'IMPORT']);

export type Stage = z.infer<typeof stageSchema>;
export type Ball = z.infer<typeof ballSchema>;
export type Outcome = z.infer<typeof outcomeSchema>;
export type InterviewType = z.infer<typeof interviewTypeSchema>;
export type Channel = z.infer<typeof channelSchema>;
export type AliasSource = z.infer<typeof aliasSourceSchema>;

export const STAGE_LABELS: Record<Stage, string> = {
  APPLIED: '已投递',
  SCREENING: '简历筛选',
  ASSESSMENT: '能力测评',
  WRITTEN_EXAM: '笔试',
  INTERVIEW: '面试',
  OFFER: 'Offer',
  CLOSED: '已结束',
};

export const BALL_LABELS: Record<Ball, string> = {
  ME: '待我行动',
  THEM: '等对方',
};

export const OUTCOME_LABELS: Record<Outcome, string> = {
  REJECTED: '对方拒绝',
  WITHDRAWN: '我方放弃',
  TALENT_POOL: '进人才库',
  ASSUMED_DEAD: '我判定已凉',
};

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  TECH: '技术面',
  MANAGER: '主管面',
  HR: 'HR 面',
  CROSS: '交叉面',
  GROUP: '群面',
  AI: 'AI 面',
};

const applicationBaseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  businessUnit: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  batch: z.string().min(1),
  channel: channelSchema.nullable().optional(),
  appliedAt: z.coerce.date().nullable().optional(),
  stage: stageSchema,
  ball: ballSchema.nullable().optional(),
  outcome: outcomeSchema.nullable().optional(),
  currentRound: z.number().int().min(0),
  currentInterviewType: interviewTypeSchema.nullable().optional(),
  lastEventAt: z.coerce.date(),
  nextDeadlineAt: z.coerce.date().nullable().optional(),
  note: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const applicationSchema = applicationBaseSchema;

export type Application = z.infer<typeof applicationSchema>;

const applicationInputBaseSchema = z.object({
  companyId: z.string().uuid().optional(),
  companyName: z.string().min(1).optional(),
  businessUnit: z.string().optional(),
  position: z.string().optional(),
  batch: z.string().min(1, '批次不能为空'),
  channel: channelSchema.optional(),
  appliedAt: z.coerce.date().nullable().optional(),
  stage: stageSchema.default('APPLIED'),
  ball: ballSchema.nullable().optional(),
  outcome: outcomeSchema.nullable().optional(),
  currentRound: z.number().int().min(0).optional(),
  currentInterviewType: interviewTypeSchema.nullable().optional(),
  nextDeadlineAt: z.coerce.date().nullable().optional(),
  note: z.string().optional(),
});

function validateApplicationFields(
  data: {
    stage: Stage;
    ball?: Ball | null;
    outcome?: Outcome | null;
  },
  ctx: z.RefinementCtx,
) {
  if (data.stage === 'OFFER' || data.stage === 'CLOSED') {
    if (data.ball != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'OFFER 与 CLOSED 环节下 ball 必须为空',
        path: ['ball'],
      });
    }
  }

  if (data.stage !== 'CLOSED' && data.outcome != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'outcome 仅在 CLOSED 环节下有效',
      path: ['outcome'],
    });
  }
}

export const createApplicationSchema = applicationInputBaseSchema
  .refine((data) => Boolean(data.companyId || data.companyName?.trim()), {
    message: '请选择已有公司或输入新公司名',
    path: ['companyName'],
  })
  .superRefine((data, ctx) => validateApplicationFields(data, ctx));

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const updateApplicationSchema = applicationInputBaseSchema
  .omit({ companyId: true, companyName: true })
  .partial()
  .extend({
    batch: z.string().min(1).optional(),
    stage: stageSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.stage !== undefined) {
      validateApplicationFields(
        {
          stage: data.stage,
          ball: data.ball,
          outcome: data.outcome,
        },
        ctx,
      );
    }
  });

export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

export const companyAliasSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  alias: z.string().min(1),
  source: aliasSourceSchema,
});

export type CompanyAlias = z.infer<typeof companyAliasSchema>;

export const createCompanyAliasSchema = z.object({
  alias: z.string().min(1, '别名不能为空'),
  source: aliasSourceSchema.default('MANUAL'),
});

export type CreateCompanyAliasInput = z.infer<typeof createCompanyAliasSchema>;

export const applicationGroupedSchema = z.object({
  company: z.object({
    id: z.string().uuid(),
    canonicalName: z.string(),
    industry: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    createdAt: z.coerce.date(),
  }),
  applications: z.array(applicationSchema),
});

export type ApplicationGrouped = z.infer<typeof applicationGroupedSchema>;

export const createApplicationResponseSchema = z.object({
  application: applicationSchema,
  duplicateWarning: z.string().nullable().optional(),
});

export type CreateApplicationResponse = z.infer<
  typeof createApplicationResponseSchema
>;

const stalenessResultSchema = z.object({
  isStale: z.boolean(),
  staleDays: z.number().int().min(0),
  thresholdDays: z.number().int().min(1),
});

export const boardApplicationItemSchema = applicationSchema.extend({
  staleness: stalenessResultSchema.nullable(),
});

export type BoardApplicationItem = z.infer<typeof boardApplicationItemSchema>;

export const boardCompanyGroupSchema = z.object({
  company: applicationGroupedSchema.shape.company,
  applications: z.array(boardApplicationItemSchema),
});

export type BoardCompanyGroup = z.infer<typeof boardCompanyGroupSchema>;

export const boardColumnSchema = z.object({
  key: z.enum(['ME', 'THEM', 'OFFER', 'CLOSED']),
  label: z.string(),
  groups: z.array(boardCompanyGroupSchema),
});

export type BoardColumn = z.infer<typeof boardColumnSchema>;

export const boardViewSchema = z.object({
  columns: z.array(boardColumnSchema),
  thresholds: z.object({
    defaultDays: z.number().int().min(1),
    afterInterviewDays: z.number().int().min(1),
  }),
});

export type BoardView = z.infer<typeof boardViewSchema>;

export const todayTodoItemSchema = applicationSchema.extend({
  companyName: z.string(),
  isDeadlinePriority: z.boolean(),
});

export type TodayTodoItem = z.infer<typeof todayTodoItemSchema>;

export const staleApplicationItemSchema = applicationSchema.extend({
  companyName: z.string(),
  staleness: stalenessResultSchema,
});

export type StaleApplicationItem = z.infer<typeof staleApplicationItemSchema>;

export const todayViewSchema = z.object({
  todos: z.array(todayTodoItemSchema),
  staleItems: z.array(staleApplicationItemSchema),
  thresholds: boardViewSchema.shape.thresholds,
});

export type TodayView = z.infer<typeof todayViewSchema>;
