import type { Company, CreateCompanyInput } from '@job-harvester/shared';

const API_BASE = '/api';

export async function fetchCompanies(): Promise<Company[]> {
  const response = await fetch(`${API_BASE}/companies`);
  if (!response.ok) {
    throw new Error('加载公司列表失败');
  }
  return response.json() as Promise<Company[]>;
}

export async function createCompany(
  input: CreateCompanyInput,
): Promise<Company> {
  const response = await fetch(`${API_BASE}/companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('创建公司失败');
  }
  return response.json() as Promise<Company>;
}
