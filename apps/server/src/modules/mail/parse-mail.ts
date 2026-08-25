import crypto from 'node:crypto';
import {
  simpleParser,
  type AddressObject,
  type ParsedMail,
} from 'mailparser';

export type ParsedMailAttachment = {
  filename: string;
  content: Buffer;
  mime: string | null;
  size: number;
};

export type ParsedMailContent = {
  messageId: string;
  fromName: string | null;
  fromAddress: string;
  subject: string;
  receivedAt: Date;
  bodyText: string;
  bodyHtml: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  attachments: ParsedMailAttachment[];
};

export async function parseMailSource(
  source: Buffer,
  options?: { internalDate?: Date },
): Promise<ParsedMailContent> {
  if (!source || source.length === 0) {
    throw new Error('邮件源码为空');
  }

  const parsed = await simpleParser(source, {
    skipHtmlToText: false,
  });
  const from = firstAddress(parsed.from);
  const html = typeof parsed.html === 'string' && parsed.html.trim() ? parsed.html : null;

  return {
    messageId: normalizeMessageId(parsed.messageId) ?? generatedMessageId(source),
    fromName: from.name,
    fromAddress: from.address,
    subject: parsed.subject?.trim() || '(无主题)',
    receivedAt: resolveReceivedAt(parsed, options?.internalDate),
    bodyText: extractBodyText(parsed, html),
    bodyHtml: html,
    inReplyTo: stringifyHeader(parsed.inReplyTo),
    referencesHeader: stringifyHeader(parsed.references),
    attachments: (parsed.attachments ?? []).map((item, index) => {
      const content = Buffer.isBuffer(item.content)
        ? item.content
        : Buffer.from(item.content ?? '');
      const filename = item.filename?.trim() || `attachment-${index + 1}.bin`;
      return {
        filename,
        content,
        mime: item.contentType ?? null,
        size: content.length,
      };
    }),
  };
}

function generatedMessageId(source: Buffer): string {
  const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 32);
  return `<generated-${hash}@job-harvester.local>`;
}

function normalizeMessageId(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function firstAddress(field: AddressObject | AddressObject[] | undefined): {
  name: string | null;
  address: string;
} {
  const list = Array.isArray(field) ? field : field ? [field] : [];
  const value = list[0]?.value?.[0];
  const address = value?.address?.trim();
  return {
    name: value?.name?.trim() || null,
    address: address || 'unknown@unknown',
  };
}

function stringifyHeader(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    const joined = value.map((item) => item.trim()).filter(Boolean).join(' ');
    return joined || null;
  }
  return value.trim() || null;
}

function resolveReceivedAt(parsed: ParsedMail, internalDate?: Date): Date {
  if (parsed.date instanceof Date && !Number.isNaN(parsed.date.getTime())) {
    return parsed.date;
  }

  const headerDate = parsed.headers.get('date');
  if (typeof headerDate === 'string') {
    const fromHeader = new Date(headerDate);
    if (!Number.isNaN(fromHeader.getTime())) {
      return fromHeader;
    }
  }

  const fromReceived = parseDateFromReceivedHeaders(
    headerValueAsStrings(parsed.headers.get('received')),
  );
  if (fromReceived) {
    return fromReceived;
  }

  if (internalDate instanceof Date && !Number.isNaN(internalDate.getTime())) {
    return internalDate;
  }

  throw new Error('无法解析邮件日期');
}

function headerValueAsStrings(value: unknown): string | string[] | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value;
  }
  return undefined;
}

function parseDateFromReceivedHeaders(
  received: string | string[] | undefined,
): Date | null {
  const lines = normalizeHeaderLines(received);
  for (const line of lines) {
    const match = line.match(/;\s*(.+)$/);
    if (!match?.[1]) {
      continue;
    }
    const parsed = new Date(match[1].trim());
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

function normalizeHeaderLines(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function extractBodyText(parsed: ParsedMail, html: string | null): string {
  const text = parsed.text?.trim();
  if (text) {
    return text;
  }
  if (!html) {
    return '';
  }
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
