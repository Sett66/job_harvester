import path from 'node:path';

export const DEFAULT_MAIL_SINCE = '2026-03-01';
export const DEFAULT_MAIL_FOLDERS = [
  'INBOX',
  '其他文件夹/QQ邮件订阅',
  'Junk',
  '其他文件夹',
];

export type MailConfig = {
  host: string;
  port: number;
  since: Date;
  sinceRaw: string;
  folders: string[];
  dataDir: string;
};

function parseFolders(raw: string | undefined): string[] {
  if (!raw || raw.trim() === '') {
    return [...DEFAULT_MAIL_FOLDERS];
  }
  const folders = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return folders.length > 0 ? folders : [...DEFAULT_MAIL_FOLDERS];
}

function parseSince(raw: string | undefined): { since: Date; sinceRaw: string } {
  const sinceRaw = raw?.trim() || DEFAULT_MAIL_SINCE;
  const since = new Date(`${sinceRaw}T00:00:00+08:00`);
  if (Number.isNaN(since.getTime())) {
    throw new Error(`MAIL_SINCE 无法解析：${sinceRaw}`);
  }
  return { since, sinceRaw };
}

export function resolveDataDir(): string {
  if (process.env.DATA_DIR) {
    return path.resolve(process.env.DATA_DIR);
  }
  const dbPath = process.env.DATABASE_PATH;
  if (dbPath && dbPath !== ':memory:') {
    return path.dirname(path.resolve(dbPath));
  }
  return path.resolve(process.cwd(), '../../data');
}

export function getMailConfig(): MailConfig {
  const { since, sinceRaw } = parseSince(process.env.MAIL_SINCE);
  return {
    host: process.env.MAIL_HOST?.trim() || 'imap.qq.com',
    port: Number(process.env.MAIL_PORT ?? 993),
    since,
    sinceRaw,
    folders: parseFolders(process.env.MAIL_FOLDERS),
    dataDir: resolveDataDir(),
  };
}
