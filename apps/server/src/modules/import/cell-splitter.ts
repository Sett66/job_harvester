import type { EventType, InterviewType } from '@job-harvester/shared';

const IMPORT_YEAR = 2026;

export type SplitEventDraft = {
  type: EventType;
  occurredAt: Date;
  rawText: string;
  round?: number;
  interviewType?: InterviewType;
  deadlineAt?: Date;
  scheduledAt?: Date;
  needsReview?: boolean;
};

export type SplitResult = {
  events: SplitEventDraft[];
  pendingReview: string[];
};

type ParseContext = {
  appliedAt: Date | null;
  defaultMonth: number;
};

const ROUND_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
};

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function makeDate(month: number, day: number, hour = 12): Date {
  return new Date(IMPORT_YEAR, month - 1, day, hour, 0, 0, 0);
}

function parseChineseDayToken(token: string): number | null {
  if (/^\d+$/.test(token)) {
    return Number.parseInt(token, 10);
  }
  if (token === '十') {
    return 10;
  }
  const tensMatch = /^([一二三四五六七八九])十([一二三四五六七八九])?$/.exec(token);
  if (tensMatch) {
    const tens = ROUND_MAP[tensMatch[1]] ?? 0;
    const ones = tensMatch[2] ? (ROUND_MAP[tensMatch[2]] ?? 0) : 0;
    return tens * 10 + ones;
  }
  return ROUND_MAP[token] ?? null;
}

function inferMonth(context: ParseContext, day: number): number {
  if (context.appliedAt) {
    return context.appliedAt.getMonth() + 1;
  }
  return context.defaultMonth || (day >= 3 ? 3 : 4);
}

function splitSegments(text: string): string[] {
  return text
    .split(/[，,](?=[\d当捞暂简aAiI4])/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseRound(text: string): number | undefined {
  const match = /(一|二|三|四)面/.exec(text);
  return match ? ROUND_MAP[match[1]] : undefined;
}

function parseInterviewType(text: string): InterviewType | undefined {
  if (/ai面/i.test(text)) {
    return 'AI';
  }
  return undefined;
}

function parseSegment(
  segment: string,
  context: ParseContext,
): SplitEventDraft | SplitEventDraft[] | null {
  const rawText = segment.trim();
  if (!rawText) {
    return null;
  }

  if (/暂不合适|暂不匹配/.test(rawText)) {
    return {
      type: 'REJECTED',
      occurredAt: context.appliedAt ?? makeDate(context.defaultMonth, 1),
      rawText,
    };
  }

  const rejectedMatch =
    /^(\d{1,2})\.(\d{1,2})\s*挂了/.exec(rawText) ??
    /^(\d{1,2})号.*?挂了/.exec(rawText);
  if (rejectedMatch) {
    const month = rejectedMatch[2]
      ? Number.parseInt(rejectedMatch[1], 10)
      : inferMonth(context, Number.parseInt(rejectedMatch[1], 10));
    const day = rejectedMatch[2]
      ? Number.parseInt(rejectedMatch[2], 10)
      : Number.parseInt(rejectedMatch[1], 10);
    return {
      type: 'REJECTED',
      occurredAt: makeDate(month, day),
      rawText,
    };
  }

  const monthRejectMatch = /(\d{1,2})月([十\d]+)号才挂/.exec(rawText);
  if (monthRejectMatch) {
    const month = Number.parseInt(monthRejectMatch[1], 10);
    const day = parseChineseDayToken(monthRejectMatch[2]) ?? 1;
    return {
      type: 'REJECTED',
      occurredAt: makeDate(month, day),
      rawText,
    };
  }

  if (/简历没过/.test(rawText)) {
    const dateMatch = /^(\d{1,2})\.(\d{1,2})/.exec(rawText);
    const occurredAt = dateMatch
      ? makeDate(
          Number.parseInt(dateMatch[1], 10),
          Number.parseInt(dateMatch[2], 10),
        )
      : context.appliedAt ?? makeDate(context.defaultMonth, 1);
    return {
      type: 'SCREEN_FAIL',
      occurredAt,
      rawText,
      interviewType: parseInterviewType(rawText),
    };
  }

  const revivedPrefixMatch = /^(\d{1,2})\.(\d{1,2})\s*捞起来/.exec(rawText);
  if (revivedPrefixMatch) {
    const month = Number.parseInt(revivedPrefixMatch[1], 10);
    const day = Number.parseInt(revivedPrefixMatch[2], 10);
    return {
      type: 'REVIVED',
      occurredAt: makeDate(month, day),
      rawText,
    };
  }

  const revivedMatch = /捞起来\s*(\d{1,2})\.(\d{1,2})/.exec(rawText);
  if (revivedMatch) {
    const month = Number.parseInt(revivedMatch[1], 10);
    const day = Number.parseInt(revivedMatch[2], 10);
    const occurredAt = makeDate(month, day);
    const events: SplitEventDraft[] = [
      {
        type: 'REVIVED',
        occurredAt,
        rawText,
      },
    ];
    if (/面/.test(rawText)) {
      events.push({
        type: /约/.test(rawText) ? 'INTERVIEW_SCHEDULED' : 'INTERVIEW_DONE',
        occurredAt,
        rawText,
        round: parseRound(rawText) ?? 1,
        interviewType: parseInterviewType(rawText),
        scheduledAt: /约/.test(rawText) ? occurredAt : undefined,
      });
    }
    return events;
  }

  if (/^当天测评/.test(rawText)) {
    const occurredAt = context.appliedAt ?? makeDate(context.defaultMonth, 1);
    return {
      type: 'ASSESSMENT_INVITE',
      occurredAt,
      rawText,
      deadlineAt: endOfDay(occurredAt),
    };
  }

  const assessmentMatch = /^(\d{1,2})\.(\d{1,2})\s*能力测评/.exec(rawText);
  if (assessmentMatch) {
    const occurredAt = makeDate(
      Number.parseInt(assessmentMatch[1], 10),
      Number.parseInt(assessmentMatch[2], 10),
    );
    return {
      type: 'ASSESSMENT_INVITE',
      occurredAt,
      rawText,
      deadlineAt: endOfDay(occurredAt),
    };
  }

  const examDayMatch = /^(\d{1,2})笔试/.exec(rawText);
  if (examDayMatch) {
    const day = Number.parseInt(examDayMatch[1], 10);
    const month = inferMonth(context, day);
    const occurredAt = makeDate(month, day);
    return {
      type: 'EXAM_INVITE',
      occurredAt,
      rawText,
      deadlineAt: endOfDay(occurredAt),
    };
  }

  const examDateMatch = /^(\d{1,2})\.(\d{1,2})\s*笔试/.exec(rawText);
  if (examDateMatch) {
    const occurredAt = makeDate(
      Number.parseInt(examDateMatch[1], 10),
      Number.parseInt(examDateMatch[2], 10),
    );
    return {
      type: 'EXAM_INVITE',
      occurredAt,
      rawText,
      deadlineAt: endOfDay(occurredAt),
    };
  }

  const scheduleInterviewMatch =
    /^(\d{1,2})\.(\d{1,2})\s*约.*?面/.exec(rawText) ??
    /^(\d{1,2})\.(\d{1,2})\s*约\s*(\d{1,2})\.(\d{1,2})\s*一面/.exec(rawText);
  if (scheduleInterviewMatch) {
    const occurredAt = makeDate(
      Number.parseInt(scheduleInterviewMatch[1], 10),
      Number.parseInt(scheduleInterviewMatch[2], 10),
    );
    const scheduledAt =
      scheduleInterviewMatch[4] != null
        ? makeDate(
            Number.parseInt(scheduleInterviewMatch[3], 10),
            Number.parseInt(scheduleInterviewMatch[4], 10),
          )
        : occurredAt;
    return {
      type: 'INTERVIEW_SCHEDULED',
      occurredAt,
      rawText,
      round: parseRound(rawText) ?? 1,
      interviewType: parseInterviewType(rawText),
      scheduledAt,
    };
  }

  const scheduleAltMatch = /^(\d{1,2})约(\d{1,2})(?:晚上(\d{1,2})[-~](\d{1,2})点)?/.exec(
    rawText,
  );
  if (scheduleAltMatch) {
    const occurredAt = makeDate(
      inferMonth(context, Number.parseInt(scheduleAltMatch[1], 10)),
      Number.parseInt(scheduleAltMatch[1], 10),
    );
    const scheduledDay = Number.parseInt(scheduleAltMatch[2], 10);
    const scheduledMonth =
      scheduledDay < occurredAt.getDate()
        ? occurredAt.getMonth() + 2
        : occurredAt.getMonth() + 1;
    const hour = scheduleAltMatch[3]
      ? Number.parseInt(scheduleAltMatch[3], 10)
      : 12;
    const scheduledAt = new Date(
      IMPORT_YEAR,
      scheduledMonth - 1,
      scheduledDay,
      hour,
      0,
      0,
      0,
    );
    return {
      type: 'INTERVIEW_SCHEDULED',
      occurredAt,
      rawText,
      round: 1,
      scheduledAt,
    };
  }

  const interviewMatch = /^(\d{1,2})\.(\d{1,2})\s*(一|二|三|四)?面/.exec(rawText);
  if (interviewMatch) {
    const occurredAt = makeDate(
      Number.parseInt(interviewMatch[1], 10),
      Number.parseInt(interviewMatch[2], 10),
    );
    const round = interviewMatch[3]
      ? ROUND_MAP[interviewMatch[3]]
      : parseRound(rawText);
    const isScheduled = /约/.test(rawText);
    return {
      type: isScheduled ? 'INTERVIEW_SCHEDULED' : 'INTERVIEW_DONE',
      occurredAt,
      rawText,
      round: round ?? 1,
      interviewType: parseInterviewType(rawText),
      scheduledAt: isScheduled ? occurredAt : undefined,
    };
  }

  if (/ai面/i.test(rawText)) {
    return {
      type: 'INTERVIEW_DONE',
      occurredAt: context.appliedAt ?? makeDate(context.defaultMonth, 1),
      rawText,
      interviewType: 'AI',
      needsReview: true,
    };
  }

  if (/笔试/.test(rawText) || /测评/.test(rawText) || /面/.test(rawText)) {
    return {
      type: 'NOTE',
      occurredAt: context.appliedAt ?? makeDate(context.defaultMonth, 1),
      rawText,
      needsReview: true,
    };
  }

  return {
    type: 'NOTE',
    occurredAt: context.appliedAt ?? makeDate(context.defaultMonth, 1),
    rawText,
    needsReview: true,
  };
}

function mergeAiInterview(
  events: SplitEventDraft[],
): SplitEventDraft[] {
  const merged: SplitEventDraft[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const current = events[index];
    const next = events[index + 1];
    if (
      current.type === 'EXAM_INVITE' &&
      next?.interviewType === 'AI' &&
      next.type === 'INTERVIEW_DONE'
    ) {
      merged.push({
        ...next,
        occurredAt: current.occurredAt,
        needsReview: false,
      });
      index += 1;
      continue;
    }
    merged.push(current);
  }
  return merged;
}

export function splitCellEvents(
  text: string,
  context: ParseContext,
): SplitResult {
  const pendingReview: string[] = [];
  const events: SplitEventDraft[] = [];

  for (const segment of splitSegments(text)) {
    const parsed = parseSegment(segment, context);
    if (!parsed) {
      continue;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      events.push(item);
      if (item.needsReview) {
        pendingReview.push(item.rawText);
      }
    }
  }

  return {
    events: mergeAiInterview(events),
    pendingReview,
  };
}

export function splitApplicationCells(input: {
  appliedAt: Date | null;
  statusCell: string | null;
  colD: string | null;
  colE: string | null;
}): SplitResult {
  const defaultMonth = input.appliedAt?.getMonth()
    ? input.appliedAt.getMonth() + 1
    : 4;
  const context: ParseContext = {
    appliedAt: input.appliedAt,
    defaultMonth,
  };

  const combined: SplitEventDraft[] = [];
  const pendingReview: string[] = [];

  for (const cell of [input.statusCell, input.colD, input.colE]) {
    if (!cell) {
      continue;
    }
    const result = splitCellEvents(cell, context);
    combined.push(...result.events);
    pendingReview.push(...result.pendingReview);
  }

  return {
    events: combined,
    pendingReview,
  };
}

export function isRevivedOnlyRow(input: {
  appliedAt: Date | null;
  statusCell: string | null;
  colD: string | null;
  colE: string | null;
}): boolean {
  return (
    input.appliedAt == null &&
    [input.statusCell, input.colD, input.colE].some((cell) =>
      cell?.includes('捞'),
    )
  );
}

export function isApplyOnlyRow(input: {
  appliedAt: Date | null;
  statusCell: string | null;
  colD: string | null;
  colE: string | null;
}): boolean {
  return (
    input.appliedAt != null &&
    !input.statusCell &&
    !input.colD &&
    !input.colE
  );
}
