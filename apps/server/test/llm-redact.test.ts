import { describe, expect, it } from 'vitest';
import { redactSensitiveText } from '../src/modules/llm/redact';

describe('redactSensitiveText', () => {
  it('redacts phone numbers', () => {
    expect(redactSensitiveText('联系我 13812345678 继续')).toBe(
      '联系我 [PHONE] 继续',
    );
  });

  it('keeps company names intact', () => {
    expect(redactSensitiveText('字节跳动 HR 联系我')).toBe(
      '字节跳动 HR 联系我',
    );
  });
});
