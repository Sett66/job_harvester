import type {
  Application,
  CreateEventInput,
  Event,
  UpdateEventInput,
} from '@job-harvester/shared';

const API_BASE = '/api';

export async function fetchApplication(id: string): Promise<Application> {
  const response = await fetch(`${API_BASE}/applications/${id}`);
  if (!response.ok) {
    throw new Error('加载投递详情失败');
  }
  return response.json() as Promise<Application>;
}

export async function fetchEvents(applicationId: string): Promise<Event[]> {
  const response = await fetch(
    `${API_BASE}/applications/${applicationId}/events`,
  );
  if (!response.ok) {
    throw new Error('加载事件时间线失败');
  }
  return response.json() as Promise<Event[]>;
}

export async function createEvent(
  applicationId: string,
  input: CreateEventInput,
): Promise<{ event: Event; application: Application }> {
  const response = await fetch(
    `${API_BASE}/applications/${applicationId}/events`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    throw new Error('创建事件失败');
  }
  return response.json() as Promise<{ event: Event; application: Application }>;
}

export async function deleteEvent(
  applicationId: string,
  eventId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/applications/${applicationId}/events/${eventId}`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    throw new Error('删除事件失败');
  }
}

export async function updateEvent(
  applicationId: string,
  eventId: string,
  input: UpdateEventInput,
): Promise<{ event: Event; application: Application }> {
  const response = await fetch(
    `${API_BASE}/applications/${applicationId}/events/${eventId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    throw new Error('更新事件失败');
  }
  return response.json() as Promise<{ event: Event; application: Application }>;
}
