/** 归一化批次名，便于「27暑期实习」「2027届暑期实习」与「2027暑期实习」视为同一批次 */
export function normalizeBatch(batch: string): string {
  let normalized = batch.replace(/[\s\-－—_]+/g, '').toLowerCase();
  normalized = normalized.replace(/届/g, '');

  if (/^(\d{2})(?=暑|秋|春|校|实)/.test(normalized)) {
    normalized = `20${normalized}`;
  }

  const isSummerIntern =
    /(暑|实习|实训|留用|转正)/.test(normalized) &&
    !/(秋招|春招|校招)/.test(normalized);

  const is2027SummerIntern =
    isSummerIntern &&
    (/2027/.test(normalized) ||
      /^27/.test(normalized) ||
      (/暑/.test(normalized) && !/2026/.test(normalized)));

  if (is2027SummerIntern) {
    return '2027暑期实习';
  }

  return normalized;
}

export function batchesMatch(
  left?: string | null,
  right?: string | null,
): boolean {
  const a = left?.trim();
  const b = right?.trim();
  if (!a || !b) {
    return false;
  }
  return normalizeBatch(a) === normalizeBatch(b);
}
