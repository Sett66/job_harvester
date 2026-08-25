import { describe, expect, it } from 'vitest';
import { redactSensitiveText } from '../src/modules/llm/redact';

describe('redactSensitiveText', () => {
  it('redacts mainland mobile numbers', () => {
    expect(redactSensitiveText('联系电话 13800138000 详询 HR')).toBe(
      '联系电话 [PHONE] 详询 HR',
    );
  });

  it('redacts 18-digit ID card numbers', () => {
    expect(
      redactSensitiveText('身份证 11010119900307889X 已上传'),
    ).toBe('身份证 [ID_CARD] 已上传');
  });

  it('redacts 16-19 digit bank card numbers', () => {
    expect(
      redactSensitiveText('工资卡 6222021234567890123 请查收'),
    ).toBe('工资卡 [BANK_CARD] 请查收');
  });

  it('keeps company names, positions, and salary text', () => {
    const text = '字节跳动 - 豆包 后端开发 薪资 25k-40k，联系 13800138000';
    const redacted = redactSensitiveText(text);
    expect(redacted).toContain('字节跳动');
    expect(redacted).toContain('豆包');
    expect(redacted).toContain('后端开发');
    expect(redacted).toContain('25k-40k');
    expect(redacted).toContain('[PHONE]');
    expect(redacted).not.toContain('13800138000');
  });

  it('does not treat ID cards as bank cards', () => {
    const redacted = redactSensitiveText('证件号 110101199003078890');
    expect(redacted).toBe('证件号 [ID_CARD]');
    expect(redacted).not.toContain('[BANK_CARD]');
  });
});
