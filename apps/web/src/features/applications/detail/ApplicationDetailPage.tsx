import {
  BALL_LABELS,
  STAGE_LABELS,
} from '@job-harvester/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchApplication } from '@/api/applications';
import { createEvent, deleteEvent, fetchEvents } from '@/api/events';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EventForm, EventTimeline } from './EventTimeline';

function formatDate(value?: Date | string | null): string {
  if (!value) {
    return '—';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString('zh-CN');
}

export function ApplicationDetailPage({
  applicationId,
  companyName,
  onBack,
}: {
  applicationId: string;
  companyName: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();

  const applicationQuery = useQuery({
    queryKey: ['applications', applicationId],
    queryFn: () => fetchApplication(applicationId),
  });

  const eventsQuery = useQuery({
    queryKey: ['applications', applicationId, 'events'],
    queryFn: () => fetchEvents(applicationId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['applications'] });
    void queryClient.invalidateQueries({ queryKey: ['board'] });
    void queryClient.invalidateQueries({ queryKey: ['today'] });
    void queryClient.invalidateQueries({
      queryKey: ['applications', applicationId],
    });
    void queryClient.invalidateQueries({
      queryKey: ['applications', applicationId, 'events'],
    });
  };

  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof createEvent>[1]) =>
      createEvent(applicationId, input),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (eventId: string) => deleteEvent(applicationId, eventId),
    onSuccess: invalidate,
  });

  const application = applicationQuery.data;

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Button variant="secondary" onClick={onBack}>
            返回列表
          </Button>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            {companyName}
          </h1>
          {application ? (
            <p className="mt-2 text-muted-foreground">
              {application.businessUnit || '（无业务线）'} · {application.batch}
            </p>
          ) : null}
        </div>
      </header>

      {applicationQuery.isLoading ? (
        <p className="text-muted-foreground">加载中…</p>
      ) : application ? (
        <Card>
          <CardHeader>
            <CardTitle>当前状态</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div>环节：{STAGE_LABELS[application.stage]}</div>
            <div>
              球在谁手里：
              {application.ball ? BALL_LABELS[application.ball] : '—'}
            </div>
            <div>最近事件：{formatDate(application.lastEventAt)}</div>
            <div>下次截止：{formatDate(application.nextDeadlineAt)}</div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>添加事件</CardTitle>
        </CardHeader>
        <CardContent>
          <EventForm
            onSubmit={async (input) => {
              await createMutation.mutateAsync(input);
            }}
            isSubmitting={createMutation.isPending}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>事件时间线</CardTitle>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading ? (
            <p className="text-muted-foreground">加载中…</p>
          ) : (
            <EventTimeline
              events={eventsQuery.data ?? []}
              onDelete={(eventId) => deleteMutation.mutate(eventId)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
