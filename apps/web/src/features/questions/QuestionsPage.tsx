import {
  QUESTION_SOURCE_LABELS,
  QUESTION_STATUS_LABELS,
  type QuestionStatus,
} from '@job-harvester/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  confirmImportCandidate,
  fetchImportCandidates,
  fetchQuestionCompanies,
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

type CandidateDraft = {
  status: QuestionStatus;
  selfRating: number | null;
};

const selectClassName =
  'flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm';

function RatingSelect({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  className?: string;
}) {
  return (
    <select
      id={id}
      className={className ?? `${selectClassName} w-28`}
      value={value ?? ''}
      onChange={(event) => {
        const next = event.target.value;
        onChange(next ? Number(next) : null);
      }}
    >
      <option value="">未评</option>
      {[1, 2, 3, 4, 5].map((rating) => (
        <option key={rating} value={rating}>
          {rating}
        </option>
      ))}
    </select>
  );
}

function StatusSelect({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: QuestionStatus;
  onChange: (value: QuestionStatus) => void;
  className?: string;
}) {
  return (
    <select
      id={id}
      className={className ?? selectClassName}
      value={value}
      onChange={(event) => onChange(event.target.value as QuestionStatus)}
    >
      {STATUS_OPTIONS.map(([status, label]) => (
        <option key={status} value={status}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function QuestionsPage() {
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<QuestionStatus | ''>('');
  const [candidateDrafts, setCandidateDrafts] = useState<
    Record<string, CandidateDraft>
  >({});

  const companiesQuery = useQuery({
    queryKey: ['questions', 'companies'],
    queryFn: fetchQuestionCompanies,
  });

  useEffect(() => {
    if (!companyId) {
      return;
    }
    const stillExists = (companiesQuery.data ?? []).some(
      (company) => company.id === companyId,
    );
    if (!stillExists && !companiesQuery.isLoading) {
      setCompanyId('');
    }
  }, [companiesQuery.data, companiesQuery.isLoading, companyId]);

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

  const pendingCandidates = importCandidatesQuery.data ?? [];
  const hasPendingImports = pendingCandidates.length > 0;

  const categories = useMemo(() => {
    const values = new Set<string>();
    for (const item of questionsQuery.data ?? []) {
      if (item.category) {
        values.add(item.category);
      }
    }
    return [...values].sort();
  }, [questionsQuery.data]);

  const getCandidateDraft = useCallback(
    (candidateId: string): CandidateDraft =>
      candidateDrafts[candidateId] ?? { status: 'NEW', selfRating: null },
    [candidateDrafts],
  );

  const setCandidateDraft = useCallback(
    (candidateId: string, patch: Partial<CandidateDraft>) => {
      setCandidateDrafts((current) => ({
        ...current,
        [candidateId]: {
          ...getCandidateDraft(candidateId),
          ...patch,
        },
      }));
    },
    [getCandidateDraft],
  );

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
      void queryClient.invalidateQueries({ queryKey: ['questions', 'companies'] });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: ({
      id,
      selfRating,
      status: nextStatus,
    }: {
      id: string;
      selfRating?: number | null;
      status?: QuestionStatus;
    }) =>
      confirmImportCandidate(id, {
        selfRating,
        status: nextStatus,
      }),
    onSuccess: (_result, variables) => {
      setCandidateDrafts((current) => {
        const next = { ...current };
        delete next[variables.id];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
      void queryClient.invalidateQueries({ queryKey: ['questions', 'companies'] });
      void queryClient.invalidateQueries({ queryKey: ['import-candidates'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: rejectImportCandidate,
    onSuccess: (_result, id) => {
      setCandidateDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['import-candidates'] });
    },
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">面试题库</h1>
        <p className="mt-2 text-muted-foreground">
          按公司、分类、掌握状态筛选；导入确认时可直接设置自评与状态
        </p>
      </header>

      {hasPendingImports ? (
        <Card className="sticky top-0 z-10 border-primary/30 bg-background/95 shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>
                语雀导入确认队列（还剩 {pendingCandidates.length} 条）
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                在此完成自评后确认入库，无需滚动到下方列表
              </p>
            </div>
          </CardHeader>
          <CardContent className="max-h-[min(60vh,32rem)] space-y-3 overflow-y-auto">
            {pendingCandidates.map((candidate) => {
              const draft = getCandidateDraft(candidate.id);
              return (
                <div
                  key={candidate.id}
                  className="rounded-lg border bg-card p-4"
                >
                  <div className="font-medium">{candidate.text}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    来源：{candidate.sourceFile}
                  </div>
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <div>
                      <Label htmlFor={`import-rating-${candidate.id}`}>
                        自评 (1-5)
                      </Label>
                      <div className="mt-2">
                        <RatingSelect
                          id={`import-rating-${candidate.id}`}
                          value={draft.selfRating}
                          onChange={(selfRating) =>
                            setCandidateDraft(candidate.id, { selfRating })
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor={`import-status-${candidate.id}`}>
                        掌握状态
                      </Label>
                      <div className="mt-2">
                        <StatusSelect
                          id={`import-status-${candidate.id}`}
                          value={draft.status}
                          onChange={(nextStatus) =>
                            setCandidateDraft(candidate.id, {
                              status: nextStatus,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pb-0.5">
                      <Button
                        size="sm"
                        onClick={() =>
                          confirmMutation.mutate({
                            id: candidate.id,
                            selfRating: draft.selfRating,
                            status: draft.status,
                          })
                        }
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
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>筛选</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <Label htmlFor="company-filter">公司</Label>
            <select
              id="company-filter"
              className={`mt-2 w-full ${selectClassName}`}
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
              className={`mt-2 w-full ${selectClassName}`}
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
              className={`mt-2 w-full ${selectClassName}`}
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
                    <div className="mt-2">
                      <RatingSelect
                        id={`rating-${item.id}`}
                        value={item.selfRating ?? null}
                        onChange={(selfRating) =>
                          updateMutation.mutate({
                            id: item.id,
                            selfRating,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor={`status-${item.id}`}>掌握状态</Label>
                    <div className="mt-2">
                      <StatusSelect
                        id={`status-${item.id}`}
                        value={item.status}
                        onChange={(nextStatus) =>
                          updateMutation.mutate({
                            id: item.id,
                            status: nextStatus,
                          })
                        }
                      />
                    </div>
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
