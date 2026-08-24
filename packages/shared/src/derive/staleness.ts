import type { Application, Ball, Stage } from '../schemas/application';

export type StalenessThresholds = {
  defaultDays: number;
  afterInterviewDays: number;
};

export const DEFAULT_STALENESS_THRESHOLDS: StalenessThresholds = {
  defaultDays: 21,
  afterInterviewDays: 10,
};

export type StalenessResult = {
  isStale: boolean;
  staleDays: number;
  thresholdDays: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getStalenessThresholdDays(
  stage: Stage,
  thresholds: StalenessThresholds = DEFAULT_STALENESS_THRESHOLDS,
): number {
  if (stage === 'INTERVIEW') {
    return thresholds.afterInterviewDays;
  }
  return thresholds.defaultDays;
}

export function computeStaleness(
  input: {
    ball: Ball | null | undefined;
    stage: Stage;
    lastEventAt: Date;
  },
  options?: {
    now?: Date;
    thresholds?: StalenessThresholds;
  },
): StalenessResult | null {
  if (input.ball !== 'THEM') {
    return null;
  }

  const now = options?.now ?? new Date();
  const thresholds = options?.thresholds ?? DEFAULT_STALENESS_THRESHOLDS;
  const thresholdDays = getStalenessThresholdDays(input.stage, thresholds);
  const staleDays = Math.floor(
    (now.getTime() - input.lastEventAt.getTime()) / MS_PER_DAY,
  );

  return {
    isStale: staleDays > thresholdDays,
    staleDays,
    thresholdDays,
  };
}

export function isDeadlinePriorityTodo(
  app: Pick<Application, 'stage' | 'nextDeadlineAt'>,
): boolean {
  return (
    (app.stage === 'WRITTEN_EXAM' || app.stage === 'ASSESSMENT') &&
    app.nextDeadlineAt != null
  );
}

export function compareTodayTodos(
  left: Pick<Application, 'stage' | 'nextDeadlineAt'>,
  right: Pick<Application, 'stage' | 'nextDeadlineAt'>,
): number {
  const leftPriority = isDeadlinePriorityTodo(left) ? 0 : 1;
  const rightPriority = isDeadlinePriorityTodo(right) ? 0 : 1;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  const leftDeadline = left.nextDeadlineAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightDeadline = right.nextDeadlineAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return leftDeadline - rightDeadline;
}

export type BoardColumnKey = 'ME' | 'THEM' | 'OFFER' | 'CLOSED';

export function getBoardColumnKey(
  app: Pick<Application, 'stage' | 'ball'>,
): BoardColumnKey {
  if (app.stage === 'CLOSED') {
    return 'CLOSED';
  }
  if (app.stage === 'OFFER') {
    return 'OFFER';
  }
  if (app.ball === 'ME') {
    return 'ME';
  }
  return 'THEM';
}
