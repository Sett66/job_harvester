import { describe, expect, it } from 'vitest';
import { deriveApplicationState } from './application-state';
import type { DeriveEventInput } from '../schemas/event';

function d(value: string): Date {
  return new Date(value);
}

function event(
  type: DeriveEventInput['type'],
  occurredAt: string,
  extra: Partial<Omit<DeriveEventInput, 'type' | 'occurredAt'>> = {},
): DeriveEventInput {
  return {
    type,
    occurredAt: d(occurredAt),
    ...extra,
  };
}

describe('deriveApplicationState', () => {
  it('derives a normal apply → exam flow with ball and deadline changes', () => {
    const deadline = d('2026-03-29T23:59:59.000Z');
    const state = deriveApplicationState([
      event('APPLY', '2026-03-01'),
      event('EXAM_INVITE', '2026-03-20', { deadlineAt: deadline }),
      event('EXAM_DONE', '2026-03-25'),
    ]);

    expect(state.stage).toBe('WRITTEN_EXAM');
    expect(state.ball).toBe('THEM');
    expect(state.nextDeadlineAt).toBeNull();
    expect(state.lastEventAt).toEqual(d('2026-03-25'));
  });

  it('puts assessment invite on ME with deadline', () => {
    const deadline = d('2026-03-22T23:59:59.000Z');
    const state = deriveApplicationState([
      event('APPLY', '2026-03-01'),
      event('ASSESSMENT_INVITE', '2026-03-10', { deadlineAt: deadline }),
    ]);

    expect(state.stage).toBe('ASSESSMENT');
    expect(state.ball).toBe('ME');
    expect(state.nextDeadlineAt).toEqual(deadline);
  });

  it('does not change state for NOTE events', () => {
    const beforeNote = deriveApplicationState([
      event('APPLY', '2026-03-01'),
      event('EXAM_INVITE', '2026-03-20', {
        deadlineAt: d('2026-03-29T23:59:59.000Z'),
      }),
    ]);

    const afterNote = deriveApplicationState([
      event('APPLY', '2026-03-01'),
      event('EXAM_INVITE', '2026-03-20', {
        deadlineAt: d('2026-03-29T23:59:59.000Z'),
      }),
      event('NOTE', '2026-03-21', {}),
    ]);

    expect(afterNote).toEqual(beforeNote);
  });

  it('tracks interview rounds across multiple scheduled interviews', () => {
    const state = deriveApplicationState([
      event('APPLY', '2026-03-01'),
      event('INTERVIEW_SCHEDULED', '2026-03-10', {
        round: 1,
        interviewType: 'TECH',
        scheduledAt: d('2026-03-12T10:00:00.000Z'),
      }),
      event('INTERVIEW_DONE', '2026-03-12'),
      event('INTERVIEW_SCHEDULED', '2026-03-15', {
        round: 2,
        interviewType: 'MANAGER',
        scheduledAt: d('2026-03-18T10:00:00.000Z'),
      }),
    ]);

    expect(state.stage).toBe('INTERVIEW');
    expect(state.ball).toBe('ME');
    expect(state.currentRound).toBe(2);
    expect(state.currentInterviewType).toBe('MANAGER');
  });

  it('revives from CLOSED back to the pre-terminal state', () => {
    const state = deriveApplicationState([
      event('APPLY', '2026-03-01'),
      event('EXAM_INVITE', '2026-03-10', {
        deadlineAt: d('2026-03-15T23:59:59.000Z'),
      }),
      event('REJECTED', '2026-03-20'),
      event('REVIVED', '2026-04-23'),
    ]);

    expect(state.stage).toBe('WRITTEN_EXAM');
    expect(state.ball).toBe('THEM');
    expect(state.outcome).toBeNull();
    expect(state.nextDeadlineAt).toEqual(d('2026-03-15T23:59:59.000Z'));
  });

  it('matches the Tencent Yuanbao revived interview flow', () => {
    const state = deriveApplicationState([
      event('REVIVED', '2026-04-23'),
      event('INTERVIEW_SCHEDULED', '2026-04-24', {
        round: 1,
        interviewType: 'TECH',
        scheduledAt: d('2026-04-25T10:00:00.000Z'),
      }),
      event('INTERVIEW_DONE', '2026-04-25'),
      event('INTERVIEW_SCHEDULED', '2026-04-26', {
        round: 2,
        interviewType: 'MANAGER',
        scheduledAt: d('2026-04-28T10:00:00.000Z'),
      }),
      event('REJECTED', '2026-04-29'),
    ]);

    expect(state.stage).toBe('CLOSED');
    expect(state.outcome).toBe('REJECTED');
    expect(state.ball).toBeNull();
    expect(state.currentRound).toBe(2);
    expect(state.currentInterviewType).toBe('MANAGER');
    expect(state.lastEventAt).toEqual(d('2026-04-29'));
  });
});
