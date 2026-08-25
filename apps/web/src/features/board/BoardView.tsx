import {
  isDeadlineOverdue,
  type BoardApplicationItem,
  type BoardColumn,
  STAGE_LABELS,
} from '@job-harvester/shared';
import { formatOptionalDateTime } from '@/lib/format';

function ApplicationCard({
  application,
  companyName,
  onOpen,
  showStaleBadge = false,
  showOverdueBadge = false,
}: {
  application: BoardApplicationItem;
  companyName: string;
  onOpen: () => void;
  showStaleBadge?: boolean;
  showOverdueBadge?: boolean;
}) {
  const isStale = showStaleBadge && application.staleness?.isStale;
  const isOverdue =
    showOverdueBadge && isDeadlineOverdue(application.nextDeadlineAt);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent/40 ${
        isStale
          ? 'border-amber-400 bg-amber-50/80 dark:bg-amber-950/20'
          : isOverdue
            ? 'border-red-300 bg-red-50/70 dark:bg-red-950/20'
            : 'bg-background'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 truncate text-sm font-medium">
          {application.businessUnit || '（无业务线）'} · {application.batch}
        </div>
        {isOverdue ? (
          <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            已逾期
          </span>
        ) : null}
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground">
        {STAGE_LABELS[application.stage]}
        {application.nextDeadlineAt
          ? ` · 截止 ${formatOptionalDateTime(application.nextDeadlineAt)}`
          : ''}
      </div>
      {isStale ? (
        <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
          沉寂 {application.staleness!.staleDays} 天（阈值{' '}
          {application.staleness!.thresholdDays} 天）
        </div>
      ) : null}
      <div className="sr-only">{companyName}</div>
    </button>
  );
}

function BoardColumnView({
  column,
  onOpenApplication,
}: {
  column: BoardColumn;
  onOpenApplication: (applicationId: string, companyName: string) => void;
}) {
  const totalCount = column.groups.reduce(
    (count, group) => count + group.applications.length,
    0,
  );

  return (
    <section className="flex min-h-0 min-w-[260px] flex-1 flex-col rounded-xl border bg-muted/20">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{column.label}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {totalCount}
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {totalCount === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            暂无记录
          </p>
        ) : (
          column.groups.map((group) => (
            <div key={group.company.id} className="space-y-2">
              <h3 className="truncate px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.company.canonicalName}
              </h3>
              <div className="space-y-2">
                {group.applications.map((application) => (
                  <ApplicationCard
                    key={application.id}
                    application={application}
                    companyName={group.company.canonicalName}
                    showStaleBadge={column.key === 'THEM'}
                    showOverdueBadge={column.key === 'ME'}
                    onOpen={() =>
                      onOpenApplication(
                        application.id,
                        group.company.canonicalName,
                      )
                    }
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function BoardView({
  columns,
  onOpenApplication,
}: {
  columns: BoardColumn[];
  onOpenApplication: (applicationId: string, companyName: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 gap-4 overflow-x-auto">
      {columns.map((column) => (
        <BoardColumnView
          key={column.key}
          column={column}
          onOpenApplication={onOpenApplication}
        />
      ))}
    </div>
  );
}
