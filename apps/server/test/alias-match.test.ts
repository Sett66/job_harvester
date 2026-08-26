import { describe, expect, it } from 'vitest';
import { normalizeCompanyName } from '../src/modules/extraction/alias-match';

describe('normalizeCompanyName', () => {
  it('ignores spaces and dash variants', () => {
    expect(normalizeCompanyName('字节 - 豆包')).toBe(
      normalizeCompanyName('字节-豆包'),
    );
    expect(normalizeCompanyName('字节 - 豆包')).toBe(
      normalizeCompanyName('字节－豆包'),
    );
  });

  it('strips common company suffixes', () => {
    expect(normalizeCompanyName('360集团')).toBe(normalizeCompanyName('360'));
  });
});
