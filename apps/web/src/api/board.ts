import type {
  Application,
  BoardView,
  TodayView,
} from '@job-harvester/shared';

const API_BASE = '/api';

export async function fetchBoard(): Promise<BoardView> {
  const response = await fetch(`${API_BASE}/applications/board`);
  if (!response.ok) {
    throw new Error('加载看板失败');
  }
  return response.json() as Promise<BoardView>;
}

export async function fetchToday(): Promise<TodayView> {
  const response = await fetch(`${API_BASE}/applications/today`);
  if (!response.ok) {
    throw new Error('加载今日待办失败');
  }
  return response.json() as Promise<TodayView>;
}

export async function archiveStaleApplication(id: string): Promise<Application> {
  const response = await fetch(`${API_BASE}/applications/${id}/archive-stale`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('归档失败');
  }
  return response.json() as Promise<Application>;
}
