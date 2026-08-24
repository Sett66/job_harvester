import {
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
}: {
  application: BoardApplicationItem;
  companyName: string;
  onOpen: () => void;
  showStaleBadge?: boolean;
}) {
  const isStale = showStaleBadge && application.staleness?.isStale;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent/40 ${
        isStale ? 'border-amber-400 bg-amber-50/80 dark:bg-amber-950/20' : 'bg-background'
      }`}
    >
      <div className="truncate text-sm font-medium">
        {application.businessUnit || '（无业务线）'} · {application.batch}
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
      <header className="flex items-center justify-between border-b px-4 py-3">
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
    <div className="flex min-h-[420px] gap-4 overflow-x-auto pb-2">
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
