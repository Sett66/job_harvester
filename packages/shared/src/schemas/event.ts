import { z } from 'zod';
import { interviewTypeSchema } from './application';

export const eventTypeSchema = z.enum([
  'APPLY',
  'SCREEN_PASS',
  'SCREEN_FAIL',
  'ASSESSMENT_INVITE',
  'ASSESSMENT_DONE',
  'EXAM_INVITE',
  'EXAM_DONE',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_DONE',
  'OFFER_INTENT',
  'OFFER_FORMAL',
  'REJECTED',
  'WITHDRAWN',
  'REVIVED',
  'NOTE',
]);

export const eventSourceSchema = z.enum(['EMAIL', 'MANUAL', 'IMPORT']);

export type EventType = z.infer<typeof eventTypeSchema>;
export type EventSource = z.infer<typeof eventSourceSchema>;

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  APPLY: '投递',
  SCREEN_PASS: '简历通过',
  SCREEN_FAIL: '简历未过',
  ASSESSMENT_INVITE: '测评通知',
  ASSESSMENT_DONE: '测评完成',
  EXAM_INVITE: '笔试通知',
  EXAM_DONE: '笔试完成',
  INTERVIEW_SCHEDULED: '面试邀约',
  INTERVIEW_DONE: '面试完成',
  OFFER_INTENT: 'Offer 意向',
  OFFER_FORMAL: '正式 Offer',
  REJECTED: '流程终止',
  WITHDRAWN: '我方放弃',
  REVIVED: '被捞起',
  NOTE: '备注',
};

export const EVENT_SOURCE_LABELS: Record<EventSource, string> = {
  EMAIL: '邮件',
  MANUAL: '手动',
  IMPORT: '导入',
};

export const eventSchema = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  type: eventTypeSchema,
  occurredAt: z.coerce.date(),
  source: eventSourceSchema,
  emailId: z.string().uuid().nullable().optional(),
  round: z.number().int().min(1).nullable().optional(),
  interviewType: interviewTypeSchema.nullable().optional(),
  deadlineAt: z.coerce.date().nullable().optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
  rawText: z.string().nullable().optional(),
  payload: z.record(z.unknown()).nullable().optional(),
  createdAt: z.coerce.date(),
});

export type Event = z.infer<typeof eventSchema>;

const eventInputBaseSchema = z.object({
  type: eventTypeSchema,
  occurredAt: z.coerce.date(),
  source: eventSourceSchema.default('MANUAL'),
  emailId: z.string().uuid().optional(),
  round: z.number().int().min(1).optional(),
  interviewType: interviewTypeSchema.optional(),
  deadlineAt: z.coerce.date().nullable().optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
  rawText: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
});

function validateEventFields(
  data: z.infer<typeof eventInputBaseSchema>,
  ctx: z.RefinementCtx,
) {
  if (data.type === 'INTERVIEW_SCHEDULED' && data.round == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '面试邀约必须填写轮次',
      path: ['round'],
    });
  }

  if (
    (data.type === 'ASSESSMENT_INVITE' || data.type === 'EXAM_INVITE') &&
    data.deadlineAt == null
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '该事件类型必须填写截止时间',
      path: ['deadlineAt'],
    });
  }

  if (data.type === 'INTERVIEW_SCHEDULED' && data.scheduledAt == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '面试邀约必须填写预约时间',
      path: ['scheduledAt'],
    });
  }
}

export const createEventSchema = eventInputBaseSchema.superRefine(
  validateEventFields,
);

export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = eventInputBaseSchema
  .partial()
  .extend({
    type: eventTypeSchema.optional(),
    occurredAt: z.coerce.date().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type !== undefined) {
      validateEventFields(
        {
          type: data.type,
          occurredAt: data.occurredAt ?? new Date(),
          source: data.source ?? 'MANUAL',
          round: data.round,
          interviewType: data.interviewType,
          deadlineAt: data.deadlineAt,
          scheduledAt: data.scheduledAt,
          rawText: data.rawText,
          payload: data.payload,
        },
        ctx,
      );
    }
  });

export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export type DeriveEventInput = {
  type: EventType;
  occurredAt: Date;
  round?: number | null;
  interviewType?: z.infer<typeof interviewTypeSchema> | null;
  deadlineAt?: Date | null;
  scheduledAt?: Date | null;
};
