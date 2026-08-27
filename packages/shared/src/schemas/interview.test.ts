import { describe, expect, it } from 'vitest';
import {
  structureDebriefOutputSchema,
  structuredQuestionSchema,
} from './interview';

describe('structuredQuestionSchema', () => {
  it('coerces boolean weakPoint from LLM output', () => {
    const parsed = structuredQuestionSchema.parse({
      text: 'Redis 缓存穿透',
      weakPoint: true,
    });

    expect(parsed.weakPoint).toBe('存在薄弱点');
  });

  it('drops false weakPoint', () => {
    const parsed = structuredQuestionSchema.parse({
      text: 'MySQL 索引',
      weakPoint: false,
    });

    expect(parsed.weakPoint).toBeUndefined();
  });

  it('accepts question alias as text', () => {
    const parsed = structuredQuestionSchema.parse({
      question: 'MySQL 索引原理',
      category: '基础',
    });

    expect(parsed.text).toBe('MySQL 索引原理');
  });

  it('rejects missing text without alias', () => {
    expect(() =>
      structuredQuestionSchema.parse({ category: '基础' }),
    ).toThrow();
  });
});

describe('structureDebriefOutputSchema', () => {
  it('accepts debrief output with boolean weakPoint in questions', () => {
    const parsed = structureDebriefOutputSchema.parse({
      summary: '技术面',
      questions: [
        { text: 'MySQL 索引', category: '基础' },
        { text: 'Redis 缓存穿透', weakPoint: true },
      ],
    });

    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[1]?.weakPoint).toBe('存在薄弱点');
  });
});
