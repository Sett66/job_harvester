import { describe, expect, it } from 'vitest';
import { batchesMatch, normalizeBatch } from '../src/modules/extraction/batch-match';

describe('normalizeBatch', () => {
  it('treats 27暑期实习 and 2027暑期实习 as the same batch', () => {
    expect(normalizeBatch('27暑期实习')).toBe(normalizeBatch('2027暑期实习'));
  });

  it('treats 2027届暑期实习 as 2027暑期实习', () => {
    expect(batchesMatch('2027届暑期实习', '2027暑期实习')).toBe(true);
  });

  it('distinguishes summer internship from autumn recruitment', () => {
    expect(normalizeBatch('2027暑期实习')).not.toBe(normalizeBatch('2026秋招'));
    expect(normalizeBatch('2026春招')).not.toBe(normalizeBatch('2026秋招'));
  });
});

describe('batchesMatch', () => {
  it('matches normalized variants', () => {
    expect(batchesMatch('27暑期实习', '2027暑期实习')).toBe(true);
  });

  it('returns false when either side is missing', () => {
    expect(batchesMatch('', '2027暑期实习')).toBe(false);
    expect(batchesMatch('2027暑期实习', null)).toBe(false);
  });
});
