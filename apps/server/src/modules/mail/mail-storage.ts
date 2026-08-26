import fs from 'node:fs';
import path from 'node:path';
import type { ParsedMailAttachment } from './parse-mail';

export type StoredAttachment = {
  filename: string;
  path: string;
  size: number;
  mime: string | null;
};

export type StoredMailFiles = {
  bodyHtmlPath: string | null;
  rawPath: string;
  attachments: StoredAttachment[];
};

export function sanitizeFilename(name: string): string {
  const trimmed = name.trim() || 'unnamed';
  const sanitized = trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  return sanitized.slice(0, 120) || 'unnamed';
}

export function writeMailFiles(options: {
  dataDir: string;
  emailId: string;
  rawSource: Buffer;
  bodyHtml: string | null;
  attachments: ParsedMailAttachment[];
}): StoredMailFiles {
  const mailsDir = path.join(options.dataDir, 'mails');
  const attachmentsDir = path.join(options.dataDir, 'attachments', options.emailId);
  fs.mkdirSync(mailsDir, { recursive: true });

  const rawPath = path.join(mailsDir, `${options.emailId}.eml`);
  fs.writeFileSync(rawPath, options.rawSource);

  let bodyHtmlPath: string | null = null;
  if (options.bodyHtml) {
    bodyHtmlPath = path.join(mailsDir, `${options.emailId}.html`);
    fs.writeFileSync(bodyHtmlPath, options.bodyHtml, 'utf8');
  }

  const attachments: StoredAttachment[] = [];
  if (options.attachments.length > 0) {
    fs.mkdirSync(attachmentsDir, { recursive: true });
    const usedNames = new Set<string>();
    for (const [index, item] of options.attachments.entries()) {
      let filename = sanitizeFilename(item.filename);
      if (usedNames.has(filename)) {
        const ext = path.extname(filename);
        const stem = path.basename(filename, ext);
        filename = `${stem}-${index + 1}${ext}`;
      }
      usedNames.add(filename);
      const filePath = path.join(attachmentsDir, filename);
      fs.writeFileSync(filePath, item.content);
      attachments.push({
        filename: item.filename,
        path: filePath,
        size: item.size,
        mime: item.mime,
      });
    }
  }

  return {
    bodyHtmlPath,
    rawPath,
    attachments,
  };
}
