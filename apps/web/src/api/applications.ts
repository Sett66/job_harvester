import type {
  Application,
  ApplicationGrouped,
  Company,
  CompanyAlias,
  CreateApplicationInput,
  CreateApplicationResponse,
  CreateCompanyAliasInput,
  UpdateApplicationInput,
} from '@job-harvester/shared';

const API_BASE = '/api';

export async function fetchApplicationsGrouped(): Promise<ApplicationGrouped[]> {
  const response = await fetch(`${API_BASE}/applications`);
  if (!response.ok) {
    throw new Error('加载投递列表失败');
  }
  return response.json() as Promise<ApplicationGrouped[]>;
}

export async function createApplication(
  input: CreateApplicationInput,
): Promise<CreateApplicationResponse> {
  const response = await fetch(`${API_BASE}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('创建投递失败');
  }
  return response.json() as Promise<CreateApplicationResponse>;
}

export async function updateApplication(
  id: string,
  input: UpdateApplicationInput,
): Promise<Application> {
  const response = await fetch(`${API_BASE}/applications/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('更新投递失败');
  }
  return response.json() as Promise<Application>;
}

export async function deleteApplication(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/applications/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('删除投递失败');
  }
}

export async function fetchCompanies(): Promise<Company[]> {
  const response = await fetch(`${API_BASE}/companies`);
  if (!response.ok) {
    throw new Error('加载公司列表失败');
  }
  return response.json() as Promise<Company[]>;
}

export async function fetchCompanyAliases(
  companyId: string,
): Promise<CompanyAlias[]> {
  const response = await fetch(`${API_BASE}/companies/${companyId}/aliases`);
  if (!response.ok) {
    throw new Error('加载别名失败');
  }
  return response.json() as Promise<CompanyAlias[]>;
}

export async function createCompanyAlias(
  companyId: string,
  input: CreateCompanyAliasInput,
): Promise<CompanyAlias> {
  const response = await fetch(`${API_BASE}/companies/${companyId}/aliases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('创建别名失败');
  }
  return response.json() as Promise<CompanyAlias>;
}

export async function deleteCompanyAlias(
  companyId: string,
  aliasId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/companies/${companyId}/aliases/${aliasId}`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    throw new Error('删除别名失败');
  }
}
