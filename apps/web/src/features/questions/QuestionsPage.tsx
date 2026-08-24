import {
  QUESTION_SOURCE_LABELS,
  QUESTION_STATUS_LABELS,
  type QuestionStatus,
} from '@job-harvester/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fetchCompanies } from '@/api/companies';
import {
  confirmImportCandidate,
  fetchImportCandidates,
  fetchQuestions,
  rejectImportCandidate,
  updateQuestion,
} from '@/api/interviews';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';

const STATUS_OPTIONS = Object.entries(QUESTION_STATUS_LABELS) as Array<
  [QuestionStatus, string]
>;

export function QuestionsPage() {
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<QuestionStatus | ''>('');

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
  });

  const questionsQuery = useQuery({
    queryKey: ['questions', { companyId, category, status }],
    queryFn: () =>
      fetchQuestions({
        companyId: companyId || undefined,
        category: category || undefined,
        status: status || undefined,
      }),
  });

  const importCandidatesQuery = useQuery({
    queryKey: ['import-candidates'],
    queryFn: fetchImportCandidates,
  });

  const categories = useMemo(() => {
    const values = new Set<string>();
    for (const item of questionsQuery.data ?? []) {
      if (item.category) {
        values.add(item.category);
      }
    }
    return [...values].sort();
  }, [questionsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      selfRating,
      status: nextStatus,
    }: {
      id: string;
      selfRating?: number | null;
      status?: QuestionStatus;
    }) => updateQuestion(id, { selfRating, status: nextStatus }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: confirmImportCandidate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
      void queryClient.invalidateQueries({ queryKey: ['import-candidates'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: rejectImportCandidate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['import-candidates'] });
    },
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 p-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">面试题库</h1>
        <p className="mt-2 text-muted-foreground">
          按公司、分类、掌握状态筛选；可手动调整自评与状态
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>筛选</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <Label htmlFor="company-filter">公司</Label>
            <select
              id="company-filter"
              className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              <option value="">全部</option>
              {(companiesQuery.data ?? []).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.canonicalName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="category-filter">分类</Label>
            <select
              id="category-filter"
              className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">全部</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="status-filter">掌握状态</Label>
            <select
              id="status-filter"
              className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as QuestionStatus | '')
              }
            >
              <option value="">全部</option>
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {(importCandidatesQuery.data?.length ?? 0) > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>语雀导入确认队列</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(importCandidatesQuery.data ?? []).map((candidate) => (
              <div
                key={candidate.id}
                className="flex items-start justify-between gap-4 rounded-lg border p-4"
              >
                <div>
                  <div className="font-medium">{candidate.text}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    来源：{candidate.sourceFile}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    onClick={() => confirmMutation.mutate(candidate.id)}
                    disabled={confirmMutation.isPending}
                  >
                    确认入库
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => rejectMutation.mutate(candidate.id)}
                    disabled={rejectMutation.isPending}
                  >
                    忽略
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            题目列表（{questionsQuery.data?.length ?? 0} 条）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {questionsQuery.isLoading ? (
            <p className="text-muted-foreground">加载中…</p>
          ) : (questionsQuery.data?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground">暂无题目</p>
          ) : (
            (questionsQuery.data ?? []).map((item) => (
              <div key={item.id} className="rounded-lg border p-4">
                <div className="font-medium">{item.text}</div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span>{QUESTION_SOURCE_LABELS[item.source]}</span>
                  {item.category ? <span>{item.category}</span> : null}
                  <span>{QUESTION_STATUS_LABELS[item.status]}</span>
                </div>
                {item.myAnswer ? (
                  <div className="mt-2 text-sm">我的回答：{item.myAnswer}</div>
                ) : null}
                <div className="mt-4 flex flex-wrap items-end gap-4">
                  <div>
                    <Label htmlFor={`rating-${item.id}`}>自评 (1-5)</Label>
                    <select
                      id={`rating-${item.id}`}
                      className="mt-2 flex h-10 w-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={item.selfRating ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        updateMutation.mutate({
                          id: item.id,
                          selfRating: value ? Number(value) : null,
                        });
                      }}
                    >
                      <option value="">未评</option>
                      {[1, 2, 3, 4, 5].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor={`status-${item.id}`}>掌握状态</Label>
                    <select
                      id={`status-${item.id}`}
                      className="mt-2 flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={item.status}
                      onChange={(event) => {
                        updateMutation.mutate({
                          id: item.id,
                          status: event.target.value as QuestionStatus,
                        });
                      }}
                    >
                      {STATUS_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
