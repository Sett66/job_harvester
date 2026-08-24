import type {
  FinalizeDebriefInput,
  ImportCandidate,
  InterviewNote,
  ProbeDebriefInput,
  ProbeOutput,
  ProbeMessage,
  Question,
  QuestionFilter,
  StartDebriefInput,
  StructureDebriefOutput,
  StructuredQuestion,
  UpdateQuestionInput,
} from '@job-harvester/shared';

const API_BASE = '/api';

export async function structureDebrief(
  input: StartDebriefInput,
): Promise<StructureDebriefOutput> {
  const response = await fetch(`${API_BASE}/debrief/structure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('结构化面试记录失败');
  }
  return response.json() as Promise<StructureDebriefOutput>;
}

export async function probeDebrief(
  input: ProbeDebriefInput,
): Promise<ProbeOutput> {
  const response = await fetch(`${API_BASE}/debrief/probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('追问失败');
  }
  return response.json() as Promise<ProbeOutput>;
}

export async function finalizeDebrief(input: FinalizeDebriefInput): Promise<{
  interviewNote: InterviewNote;
  questions: Question[];
}> {
  const response = await fetch(`${API_BASE}/debrief/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('保存面试记录失败');
  }
  return response.json() as Promise<{
    interviewNote: InterviewNote;
    questions: Question[];
  }>;
}

export async function fetchQuestions(
  filter: QuestionFilter = {},
): Promise<Question[]> {
  const params = new URLSearchParams();
  if (filter.companyId) params.set('companyId', filter.companyId);
  if (filter.applicationId) params.set('applicationId', filter.applicationId);
  if (filter.category) params.set('category', filter.category);
  if (filter.status) params.set('status', filter.status);

  const query = params.toString();
  const response = await fetch(
    `${API_BASE}/questions${query ? `?${query}` : ''}`,
  );
  if (!response.ok) {
    throw new Error('加载题库失败');
  }
  return response.json() as Promise<Question[]>;
}

export async function updateQuestion(
  id: string,
  input: UpdateQuestionInput,
): Promise<Question> {
  const response = await fetch(`${API_BASE}/questions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('更新题目失败');
  }
  return response.json() as Promise<Question>;
}

export async function fetchImportCandidates(): Promise<ImportCandidate[]> {
  const response = await fetch(`${API_BASE}/import-candidates`);
  if (!response.ok) {
    throw new Error('加载导入候选失败');
  }
  return response.json() as Promise<ImportCandidate[]>;
}

export async function confirmImportCandidate(id: string): Promise<Question> {
  const response = await fetch(`${API_BASE}/import-candidates/${id}/confirm`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('确认导入失败');
  }
  return response.json() as Promise<Question>;
}

export async function rejectImportCandidate(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/import-candidates/${id}/reject`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('拒绝导入失败');
  }
}

export type {
  FinalizeDebriefInput,
  ImportCandidate,
  InterviewNote,
  ProbeDebriefInput,
  ProbeMessage,
  ProbeOutput,
  Question,
  QuestionFilter,
  StartDebriefInput,
  StructureDebriefOutput,
  StructuredQuestion,
  UpdateQuestionInput,
};
