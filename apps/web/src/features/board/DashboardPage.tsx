import { useQuery } from '@tanstack/react-query';
import { fetchBoard, fetchToday } from '@/api/board';
import { Button } from '@/components/ui/button';
import { BoardView } from '@/features/board/BoardView';
import { TodayPanel } from '@/features/today/TodayPanel';

export function DashboardPage({
  onOpenApplication,
  onOpenApplicationsList,
}: {
  onOpenApplication: (applicationId: string, companyName: string) => void;
  onOpenApplicationsList: () => void;
}) {
  const boardQuery = useQuery({
    queryKey: ['board'],
    queryFn: fetchBoard,
  });

  const todayQuery = useQuery({
    queryKey: ['today'],
    queryFn: fetchToday,
  });

  const isLoading = boardQuery.isLoading || todayQuery.isLoading;
  const isError = boardQuery.isError || todayQuery.isError;
  const columns = boardQuery.data?.columns ?? [];
  const isBoardEmpty = columns.every(
    (column) =>
      column.groups.reduce(
        (count, group) => count + group.applications.length,
        0,
      ) === 0,
  );

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[1400px] flex-col gap-4 overflow-hidden overscroll-none px-6 py-4 lg:px-8">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">秋招进度</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            按「球在谁手里」看全局，左侧待办优先处理截止事项
          </p>
        </div>
        <Button variant="secondary" onClick={onOpenApplicationsList}>
          全部投递
        </Button>
      </header>

      {isLoading ? (
        <p className="shrink-0 text-muted-foreground">加载中…</p>
      ) : isError ? (
        <p className="shrink-0 text-destructive">加载失败，请确认后端已启动</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] gap-4 overflow-hidden">
          <TodayPanel
            todos={todayQuery.data?.todos ?? []}
            staleItems={todayQuery.data?.staleItems ?? []}
            onOpenApplication={onOpenApplication}
          />

          <section className="flex min-h-0 flex-col gap-3 overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">看板</h2>
              {todayQuery.data ? (
                <p className="text-sm text-muted-foreground">
                  沉寂阈值：默认 {todayQuery.data.thresholds.defaultDays} 天 ·
                  面试后 {todayQuery.data.thresholds.afterInterviewDays} 天
                </p>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {isBoardEmpty ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed px-6">
                  <div className="py-8 text-center">
                    <p className="text-lg font-medium">还没有投递记录</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      去「全部投递」新增第一条，看板会自动按球在谁手里分栏
                    </p>
                    <Button className="mt-4" onClick={onOpenApplicationsList}>
                      新增投递
                    </Button>
                  </div>
                </div>
              ) : (
                <BoardView
                  columns={columns}
                  onOpenApplication={onOpenApplication}
                />
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
