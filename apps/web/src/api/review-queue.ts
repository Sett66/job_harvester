import type { ConfirmReviewInput, ReviewQueueItem } from '@job-harvester/shared';

const API_BASE = '/api';

export async function fetchReviewQueue(): Promise<ReviewQueueItem[]> {
  const response = await fetch(`${API_BASE}/review-queue`);
  if (!response.ok) {
    throw new Error('加载确认队列失败');
  }
  return response.json() as Promise<ReviewQueueItem[]>;
}

export async function confirmReviewItem(
  extractionId: string,
  input: ConfirmReviewInput,
): Promise<{ applicationId: string }> {
  const response = await fetch(`${API_BASE}/review-queue/${extractionId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('确认失败');
  }
  return response.json() as Promise<{ applicationId: string }>;
}

export async function ignoreReviewItem(extractionId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/review-queue/${extractionId}/ignore`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('忽略失败');
  }
}
