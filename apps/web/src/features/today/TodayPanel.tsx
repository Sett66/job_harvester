import {
  STAGE_LABELS,
  type StaleApplicationItem,
  type TodayTodoItem,
} from '@job-harvester/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { archiveStaleApplication } from '@/api/board';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatOptionalDateTime } from '@/lib/format';

function TodoItem({
  item,
  onOpen,
}: {
  item: TodayTodoItem;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent/40"
    >
      <div className="min-w-0">
        <div className="truncate font-medium">
          {item.companyName} · {item.businessUnit || '（无业务线）'}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {STAGE_LABELS[item.stage]}
          {item.nextDeadlineAt
            ? ` · ${formatOptionalDateTime(item.nextDeadlineAt)}`
            : ' · 无截止时间'}
        </div>
      </div>
      {item.isDeadlinePriority ? (
        <span className="shrink-0 rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          截止
        </span>
      ) : null}
    </button>
  );
}

function StaleItem({
  item,
  onOpen,
  onArchive,
  isArchiving,
}: {
  item: StaleApplicationItem;
  onOpen: () => void;
  onArchive: () => void;
  isArchiving: boolean;
}) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50/70 px-3 py-2 dark:bg-amber-950/20">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left"
      >
        <div className="font-medium">
          {item.companyName} · {item.businessUnit || '（无业务线）'}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {STAGE_LABELS[item.stage]} · 已等待 {item.staleness.staleDays} 天
        </div>
      </button>
      <Button
        variant="secondary"
        size="sm"
        className="mt-2"
        disabled={isArchiving}
        onClick={onArchive}
      >
        归档为已凉
      </Button>
    </div>
  );
}

export function TodayPanel({
  todos,
  staleItems,
  onOpenApplication,
}: {
  todos: TodayTodoItem[];
  staleItems: StaleApplicationItem[];
  onOpenApplication: (applicationId: string, companyName: string) => void;
}) {
  const queryClient = useQueryClient();
  const archiveMutation = useMutation({
    mutationFn: archiveStaleApplication,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
      void queryClient.invalidateQueries({ queryKey: ['board'] });
      void queryClient.invalidateQueries({ queryKey: ['today'] });
    },
  });

  return (
    <div className="grid h-full min-h-0 grid-rows-2 gap-4 overflow-hidden lg:grid-cols-2 lg:grid-rows-1">
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <CardHeader className="shrink-0 px-4 py-3">
          <CardTitle>今日待办</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
          {todos.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              暂无未截止的待办
            </p>
          ) : (
            todos.map((item) => (
              <TodoItem
                key={item.id}
                item={item}
                onOpen={() =>
                  onOpenApplication(item.id, item.companyName)
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-col overflow-hidden">
        <CardHeader className="shrink-0 px-4 py-3">
          <CardTitle>沉寂预警</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
          {staleItems.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              暂无长期无响应的记录
            </p>
          ) : (
            staleItems.map((item) => (
              <StaleItem
                key={item.id}
                item={item}
                isArchiving={archiveMutation.isPending}
                onOpen={() =>
                  onOpenApplication(item.id, item.companyName)
                }
                onArchive={() => {
                  if (window.confirm('确定将这条记录归档为「我判定已凉」吗？')) {
                    archiveMutation.mutate(item.id);
                  }
                }}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
