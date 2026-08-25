export type CompanySplitResult = {
  canonicalName: string;
  businessUnit: string | null;
  alias: string;
};

const BYTE_DANCE_PATTERN = /^字节\s*[-－—]?\s*(.+)$/;

const TENCENT_BUSINESS_UNITS: Record<string, string | null> = {
  腾讯: null,
  腾讯元宝: '腾讯元宝',
  腾讯云智: '腾讯云智',
  腾讯视频: '腾讯视频',
};

function normalizeBusinessUnit(value: string): string {
  return value.replace(/\s+/g, '').trim();
}

export function splitCompany(raw: string): CompanySplitResult {
  const alias = raw.trim();
  const byteMatch = BYTE_DANCE_PATTERN.exec(alias);
  if (byteMatch) {
    return {
      canonicalName: '字节跳动',
      businessUnit: normalizeBusinessUnit(byteMatch[1]),
      alias,
    };
  }

  if (alias in TENCENT_BUSINESS_UNITS) {
    return {
      canonicalName: '腾讯',
      businessUnit: TENCENT_BUSINESS_UNITS[alias],
      alias,
    };
  }

  return {
    canonicalName: alias,
    businessUnit: null,
    alias,
  };
}
