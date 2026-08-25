import { describe, expect, it } from 'vitest';
import {
  compareTodayTodos,
  computeStaleness,
  getStalenessThresholdDays,
  isDeadlineOverdue,
  isDeadlinePriorityTodo,
  isOpenTodayTodo,
} from './staleness';

function d(value: string): Date {
  return new Date(value);
}

describe('computeStaleness', () => {
  const now = d('2026-08-24T12:00:00.000Z');

  it('marks THEM records stale after default threshold', () => {
    const result = computeStaleness(
      {
        ball: 'THEM',
        stage: 'APPLIED',
        lastEventAt: d('2026-07-20T12:00:00.000Z'),
      },
      { now },
    );

    expect(result).toEqual({
      isStale: true,
      staleDays: 35,
      thresholdDays: 21,
    });
  });

  it('does not mark THEM records stale within default threshold', () => {
    const result = computeStaleness(
      {
        ball: 'THEM',
        stage: 'APPLIED',
        lastEventAt: d('2026-08-10T12:00:00.000Z'),
      },
      { now },
    );

    expect(result?.isStale).toBe(false);
    expect(result?.staleDays).toBe(14);
  });

  it('uses shorter threshold after interview stage', () => {
    const thresholdDays = getStalenessThresholdDays('INTERVIEW');
    expect(thresholdDays).toBe(10);

    const result = computeStaleness(
      {
        ball: 'THEM',
        stage: 'INTERVIEW',
        lastEventAt: d('2026-08-10T12:00:00.000Z'),
      },
      { now },
    );

    expect(result?.isStale).toBe(true);
    expect(result?.thresholdDays).toBe(10);
  });

  it('returns null for ball == ME', () => {
    const result = computeStaleness(
      {
        ball: 'ME',
        stage: 'WRITTEN_EXAM',
        lastEventAt: d('2026-07-01T12:00:00.000Z'),
      },
      { now },
    );

    expect(result).toBeNull();
  });

  it('respects custom thresholds', () => {
    const result = computeStaleness(
      {
        ball: 'THEM',
        stage: 'APPLIED',
        lastEventAt: d('2026-08-01T12:00:00.000Z'),
      },
      {
        now,
        thresholds: { defaultDays: 30, afterInterviewDays: 5 },
      },
    );

    expect(result?.isStale).toBe(false);
    expect(result?.thresholdDays).toBe(30);
  });
});

describe('compareTodayTodos', () => {
  it('puts exam/assessment deadlines before interview appointments', () => {
    const exam = {
      stage: 'WRITTEN_EXAM' as const,
      nextDeadlineAt: d('2026-08-25T23:59:59.000Z'),
    };
    const interview = {
      stage: 'INTERVIEW' as const,
      nextDeadlineAt: d('2026-08-24T10:00:00.000Z'),
    };

    expect(compareTodayTodos(exam, interview)).toBeLessThan(0);
    expect(isDeadlinePriorityTodo(exam)).toBe(true);
    expect(isDeadlinePriorityTodo(interview)).toBe(false);
  });

  it('sorts by nextDeadlineAt within the same priority group', () => {
    const sooner = {
      stage: 'INTERVIEW' as const,
      nextDeadlineAt: d('2026-08-25T10:00:00.000Z'),
    };
    const later = {
      stage: 'INTERVIEW' as const,
      nextDeadlineAt: d('2026-08-30T10:00:00.000Z'),
    };

    expect(compareTodayTodos(sooner, later)).toBeLessThan(0);
  });
});

describe('isDeadlineOverdue / isOpenTodayTodo', () => {
  const now = new Date(2026, 7, 25, 15, 30, 0);

  it('treats a deadline on a previous local calendar day as overdue', () => {
    expect(isDeadlineOverdue(new Date(2026, 7, 24, 23, 59, 0), now)).toBe(true);
    expect(
      isOpenTodayTodo(
        {
          ball: 'ME',
          stage: 'INTERVIEW',
          nextDeadlineAt: new Date(2026, 7, 24, 10, 0, 0),
        },
        now,
      ),
    ).toBe(false);
  });

  it('keeps a deadline on today even if the clock time has passed', () => {
    expect(isDeadlineOverdue(new Date(2026, 7, 25, 9, 0, 0), now)).toBe(false);
    expect(
      isOpenTodayTodo(
        {
          ball: 'ME',
          stage: 'INTERVIEW',
          nextDeadlineAt: new Date(2026, 7, 25, 9, 0, 0),
        },
        now,
      ),
    ).toBe(true);
  });

  it('includes records with no deadline in today todos', () => {
    expect(isDeadlineOverdue(null, now)).toBe(false);
    expect(
      isOpenTodayTodo(
        { ball: 'ME', stage: 'INTERVIEW', nextDeadlineAt: null },
        now,
      ),
    ).toBe(true);
  });

  it('includes a future local calendar day in today todos', () => {
    expect(isDeadlineOverdue(new Date(2026, 7, 26, 9, 0, 0), now)).toBe(false);
    expect(
      isOpenTodayTodo(
        {
          ball: 'ME',
          stage: 'WRITTEN_EXAM',
          nextDeadlineAt: new Date(2026, 7, 26, 9, 0, 0),
        },
        now,
      ),
    ).toBe(true);
  });

  it('excludes CLOSED / OFFER and non-ME balls from today todos', () => {
    expect(
      isOpenTodayTodo(
        {
          ball: 'ME',
          stage: 'CLOSED',
          nextDeadlineAt: new Date(2026, 7, 26, 10, 0, 0),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isOpenTodayTodo(
        {
          ball: 'THEM',
          stage: 'INTERVIEW',
          nextDeadlineAt: new Date(2026, 7, 26, 10, 0, 0),
        },
        now,
      ),
    ).toBe(false);
  });
});
