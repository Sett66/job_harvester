import type { Ball, InterviewType, Outcome, Stage } from '../schemas/application';
import type { DeriveEventInput, EventType } from '../schemas/event';

export type DerivedApplicationState = {
  stage: Stage;
  ball: Ball | null;
  outcome: Outcome | null;
  currentRound: number;
  currentInterviewType: InterviewType | null;
  lastEventAt: Date;
  nextDeadlineAt: Date | null;
};

const TERMINAL_EVENT_TYPES: EventType[] = [
  'SCREEN_FAIL',
  'REJECTED',
  'WITHDRAWN',
];

function createInitialState(
  fallbackLastEventAt?: Date,
): DerivedApplicationState {
  return {
    stage: 'APPLIED',
    ball: null,
    outcome: null,
    currentRound: 0,
    currentInterviewType: null,
    lastEventAt: fallbackLastEventAt ?? new Date(0),
    nextDeadlineAt: null,
  };
}

function sortEvents(events: DeriveEventInput[]): DeriveEventInput[] {
  return [...events].sort(
    (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
  );
}

function findLastTerminalIndex(events: DeriveEventInput[]): number {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (TERMINAL_EVENT_TYPES.includes(events[index].type)) {
      return index;
    }
  }
  return -1;
}

function applyEvent(
  state: DerivedApplicationState,
  event: DeriveEventInput,
): DerivedApplicationState {
  if (event.type === 'NOTE') {
    return state;
  }

  const next: DerivedApplicationState = {
    ...state,
    lastEventAt: event.occurredAt,
  };

  switch (event.type) {
    case 'APPLY':
      return {
        ...next,
        stage: 'APPLIED',
        ball: 'THEM',
        outcome: null,
        nextDeadlineAt: null,
      };
    case 'SCREEN_PASS':
      return {
        ...next,
        stage: 'SCREENING',
        ball: 'THEM',
        outcome: null,
        nextDeadlineAt: null,
      };
    case 'SCREEN_FAIL':
      return {
        ...next,
        stage: 'CLOSED',
        ball: null,
        outcome: 'REJECTED',
        nextDeadlineAt: null,
      };
    case 'ASSESSMENT_INVITE':
      return {
        ...next,
        stage: 'ASSESSMENT',
        ball: 'ME',
        outcome: null,
        nextDeadlineAt: event.deadlineAt ?? null,
      };
    case 'ASSESSMENT_DONE':
      return {
        ...next,
        stage: 'ASSESSMENT',
        ball: 'THEM',
        outcome: null,
        nextDeadlineAt: null,
      };
    case 'EXAM_INVITE':
      return {
        ...next,
        stage: 'WRITTEN_EXAM',
        ball: 'ME',
        outcome: null,
        nextDeadlineAt: event.deadlineAt ?? null,
      };
    case 'EXAM_DONE':
      return {
        ...next,
        stage: 'WRITTEN_EXAM',
        ball: 'THEM',
        outcome: null,
        nextDeadlineAt: null,
      };
    case 'INTERVIEW_SCHEDULED':
      return {
        ...next,
        stage: 'INTERVIEW',
        ball: 'ME',
        outcome: null,
        currentRound: event.round ?? next.currentRound,
        currentInterviewType: event.interviewType ?? null,
        nextDeadlineAt: event.scheduledAt ?? null,
      };
    case 'INTERVIEW_DONE':
      return {
        ...next,
        stage: 'INTERVIEW',
        ball: 'THEM',
        outcome: null,
        nextDeadlineAt: null,
      };
    case 'OFFER_INTENT':
    case 'OFFER_FORMAL':
      return {
        ...next,
        stage: 'OFFER',
        ball: null,
        outcome: null,
        nextDeadlineAt: null,
      };
    case 'REJECTED':
      return {
        ...next,
        stage: 'CLOSED',
        ball: null,
        outcome: 'REJECTED',
        nextDeadlineAt: null,
      };
    case 'WITHDRAWN':
      return {
        ...next,
        stage: 'CLOSED',
        ball: null,
        outcome: 'WITHDRAWN',
        nextDeadlineAt: null,
      };
    case 'REVIVED':
      return next;
    default:
      return next;
  }
}

export function deriveApplicationState(
  events: DeriveEventInput[],
  options?: { fallbackLastEventAt?: Date },
): DerivedApplicationState {
  const sorted = sortEvents(events);
  let state = createInitialState(options?.fallbackLastEventAt);

  for (let index = 0; index < sorted.length; index += 1) {
    const event = sorted[index];

    if (event.type === 'NOTE') {
      continue;
    }

    if (event.type === 'REVIVED') {
      const before = sorted.slice(0, index);
      const terminalIndex = findLastTerminalIndex(before);
      const replayEvents =
        terminalIndex >= 0 ? before.slice(0, terminalIndex) : before;
      state = deriveApplicationState(replayEvents, options);
      state.lastEventAt = event.occurredAt;
      state.ball = 'THEM';
      state.outcome = null;
      continue;
    }

    state = applyEvent(state, event);
  }

  return state;
}

export function toDeriveEventInput(event: {
  type: EventType;
  occurredAt: Date;
  round?: number | null;
  interviewType?: InterviewType | null;
  deadlineAt?: Date | null;
  scheduledAt?: Date | null;
}): DeriveEventInput {
  return {
    type: event.type,
    occurredAt: event.occurredAt,
    round: event.round ?? null,
    interviewType: event.interviewType ?? null,
    deadlineAt: event.deadlineAt ?? null,
    scheduledAt: event.scheduledAt ?? null,
  };
}
