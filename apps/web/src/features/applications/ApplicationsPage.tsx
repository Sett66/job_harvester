import {
  type Application,
  STAGE_LABELS,
  type CreateApplicationInput,
  type UpdateApplicationInput,
} from '@job-harvester/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createApplication,
  deleteApplication,
  fetchApplicationsGrouped,
  fetchCompanies,
  updateApplication,
} from '@/api/applications';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ApplicationForm,
  applicationToFormValues,
} from '@/features/applications/ApplicationForm';

function formatOptionalDate(value?: Date | string | null): string {
  if (!value) {
    return '—';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString('zh-CN');
}

export function ApplicationsPage({
  onBack,
  onOpenApplication,
}: {
  onBack?: () => void;
  onOpenApplication?: (applicationId: string, companyName: string) => void;
}) {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [editingApplication, setEditingApplication] =
    useState<Application | null>(null);

  const groupedQuery = useQuery({
    queryKey: ['applications', 'grouped'],
    queryFn: fetchApplicationsGrouped,
  });

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['applications'] });
    void queryClient.invalidateQueries({ queryKey: ['companies'] });
    void queryClient.invalidateQueries({ queryKey: ['board'] });
    void queryClient.invalidateQueries({ queryKey: ['today'] });
  };

  const createMutation = useMutation({
    mutationFn: createApplication,
    onSuccess: (result) => {
      setDuplicateWarning(result.duplicateWarning ?? null);
      invalidate();
      if (!result.duplicateWarning) {
        setShowCreateForm(false);
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateApplicationInput;
    }) => updateApplication(id, input),
    onSuccess: () => {
      invalidate();
      setEditingApplication(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteApplication,
    onSuccess: invalidate,
  });

  async function handleCreate(input: CreateApplicationInput) {
    setDuplicateWarning(null);
    await createMutation.mutateAsync(input);
  }

  async function handleUpdate(input: UpdateApplicationInput) {
    if (!editingApplication) {
      return;
    }
    await updateMutation.mutateAsync({
      id: editingApplication.id,
      input,
    });
  }

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-8 p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          {onBack ? (
            <Button variant="secondary" size="sm" className="mb-3" onClick={onBack}>
              返回看板
            </Button>
          ) : null}
          <h1 className="text-3xl font-bold tracking-tight">投递记录</h1>
          <p className="mt-2 text-muted-foreground">
            按公司聚合展示，一条投递 = 公司 + 业务线 + 批次
          </p>
        </div>
        <Button
          onClick={() => {
            setShowCreateForm((current) => !current);
            setDuplicateWarning(null);
          }}
        >
          {showCreateForm ? '收起表单' : '新增投递'}
        </Button>
      </header>

      {showCreateForm ? (
        <Card>
          <CardHeader>
            <CardTitle>新增投递</CardTitle>
          </CardHeader>
          <CardContent>
            <ApplicationForm
              companies={companiesQuery.data ?? []}
              onSubmit={async (values) => {
                await handleCreate(values as CreateApplicationInput);
              }}
              onCancel={() => {
                setShowCreateForm(false);
                setDuplicateWarning(null);
              }}
              isSubmitting={createMutation.isPending}
              duplicateWarning={duplicateWarning}
            />
          </CardContent>
        </Card>
      ) : null}

      {groupedQuery.isLoading || companiesQuery.isLoading ? (
        <p className="text-muted-foreground">加载中…</p>
      ) : groupedQuery.isError ? (
        <p className="text-destructive">加载失败</p>
      ) : (groupedQuery.data?.length ?? 0) === 0 ? (
        <p className="text-muted-foreground">暂无投递记录，请先新增</p>
      ) : (
        <div className="grid gap-6">
          {(groupedQuery.data ?? []).map((group) => (
            <Card key={group.company.id}>
              <CardHeader>
                <CardTitle>{group.company.canonicalName}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {group.applications.map((application) => (
                  <div
                    key={application.id}
                    className="rounded-lg border p-4"
                  >
                    {editingApplication?.id === application.id ? (
                      <ApplicationForm
                        mode="edit"
                        initialValues={applicationToFormValues(application)}
                        onSubmit={async (values) => {
                          await handleUpdate(values as UpdateApplicationInput);
                        }}
                        onCancel={() => setEditingApplication(null)}
                        isSubmitting={updateMutation.isPending}
                        submitLabel="更新"
                      />
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="font-medium">
                            {application.businessUnit || '（无业务线）'} ·{' '}
                            {application.batch}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {[
                              STAGE_LABELS[application.stage],
                              application.position,
                              application.channel,
                              application.appliedAt
                                ? `投递 ${formatOptionalDate(application.appliedAt)}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </div>
                          {application.note ? (
                            <div className="text-sm text-muted-foreground">
                              备注：{application.note}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              if (onOpenApplication) {
                                onOpenApplication(
                                  application.id,
                                  group.company.canonicalName,
                                );
                                return;
                              }
                            }}
                          >
                            详情
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingApplication(application)}
                          >
                            编辑
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              if (
                                window.confirm('确定删除这条投递记录吗？')
                              ) {
                                deleteMutation.mutate(application.id);
                              }
                            }}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
