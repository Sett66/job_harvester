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

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-8 p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">秋招进度</h1>
          <p className="mt-2 text-muted-foreground">
            按「球在谁手里」看全局，左侧待办优先处理截止事项
          </p>
        </div>
        <Button variant="secondary" onClick={onOpenApplicationsList}>
          全部投递
        </Button>
      </header>

      {isLoading ? (
        <p className="text-muted-foreground">加载中…</p>
      ) : isError ? (
        <p className="text-destructive">加载失败，请确认后端已启动</p>
      ) : (
        <>
          <TodayPanel
            todos={todayQuery.data?.todos ?? []}
            staleItems={todayQuery.data?.staleItems ?? []}
            onOpenApplication={onOpenApplication}
          />

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">看板</h2>
              {todayQuery.data ? (
                <p className="text-sm text-muted-foreground">
                  沉寂阈值：默认 {todayQuery.data.thresholds.defaultDays} 天 ·
                  面试后 {todayQuery.data.thresholds.afterInterviewDays} 天
                </p>
              ) : null}
            </div>

            {(boardQuery.data?.columns ?? []).every(
              (column) =>
                column.groups.reduce(
                  (count, group) => count + group.applications.length,
                  0,
                ) === 0,
            ) ? (
              <div className="rounded-xl border border-dashed px-6 py-16 text-center">
                <p className="text-lg font-medium">还没有投递记录</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  去「全部投递」新增第一条，看板会自动按球在谁手里分栏
                </p>
                <Button className="mt-4" onClick={onOpenApplicationsList}>
                  新增投递
                </Button>
              </div>
            ) : (
              <BoardView
                columns={boardQuery.data?.columns ?? []}
                onOpenApplication={onOpenApplication}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
