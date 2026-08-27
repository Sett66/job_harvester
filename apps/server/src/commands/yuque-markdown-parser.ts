function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
}

export function stripHtmlTags(text: string): string {
  return decodeHtmlEntities(
    text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''),
  );
}

export function stripMarkdownInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s*/g, '')
    .replace(/^[-*+]\s+/g, '')
    .replace(/^\d+[.)]\s+/g, '');
}

export function normalizeQuestionText(text: string): string {
  return stripMarkdownInline(stripHtmlTags(text)).replace(/\s+/g, ' ').trim();
}

function shouldSkipQuestion(text: string): boolean {
  if (text.length < 3) {
    return true;
  }
  if (/^(目录|摘要|前言|附录|tags?|标签)/i.test(text)) {
    return true;
  }
  if (/^#+$/.test(text)) {
    return true;
  }
  if (/^<[^>]+>$/.test(text)) {
    return true;
  }
  return false;
}

function extractLineQuestion(rawLine: string): string | null {
  const line = rawLine.trim();
  if (!line) {
    return null;
  }

  const headingMatch = line.match(/^#{1,6}\s*(.+)$/);
  const listMatch = line.match(/^[-*+]\s+(.+)$/);
  const numberedMatch = line.match(/^\d+[.)]\s+(.+)$/);

  const rawText =
    headingMatch?.[1] ?? listMatch?.[1] ?? numberedMatch?.[1] ?? null;
  if (!rawText) {
    return null;
  }

  const text = normalizeQuestionText(rawText);
  if (shouldSkipQuestion(text)) {
    return null;
  }

  return text;
}

export function extractQuestionsFromMarkdown(
  content: string,
  sourceFile: string,
) {
  const lines = content.split(/\r?\n/);
  const results: Array<{ text: string; category?: string }> = [];

  for (const line of lines) {
    const text = extractLineQuestion(line);
    if (text) {
      results.push({ text });
    }
  }

  if (results.length === 0) {
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((part) => normalizeQuestionText(part))
      .filter((part) => !shouldSkipQuestion(part));
    for (const paragraph of paragraphs.slice(0, 20)) {
      results.push({ text: paragraph.slice(0, 500) });
    }
  }

  return results.map((item) => ({ ...item, sourceFile }));
}
