import type {
  EmailDetail,
  EmailListResponse,
  MailStatus,
  MailSyncResult,
} from '@job-harvester/shared';

const API_BASE = '/api';

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? fallbackMessage);
  }
  return response.json() as Promise<T>;
}

export async function fetchMails(options?: {
  limit?: number;
  offset?: number;
}): Promise<EmailListResponse> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  if (options?.offset !== undefined) {
    params.set('offset', String(options.offset));
  }
  const query = params.toString();
  const response = await fetch(`${API_BASE}/mails${query ? `?${query}` : ''}`);
  return readJson<EmailListResponse>(response, '加载邮件列表失败');
}

export async function fetchMail(id: string): Promise<EmailDetail> {
  const response = await fetch(`${API_BASE}/mails/${id}`);
  return readJson<EmailDetail>(response, '加载邮件详情失败');
}

export async function fetchMailStatus(): Promise<MailStatus> {
  const response = await fetch(`${API_BASE}/mails/status`);
  return readJson<MailStatus>(response, '加载邮箱状态失败');
}

export async function syncMails(): Promise<MailSyncResult> {
  const response = await fetch(`${API_BASE}/mails/sync`, { method: 'POST' });
  return readJson<MailSyncResult>(response, '同步邮件失败');
}
