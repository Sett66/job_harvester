import type {
  EmailDetail,
  EmailListItem,
  MailSyncResult,
  ScreenResult,
} from '@job-harvester/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  fetchMail,
  fetchMailScreenStats,
  fetchMails,
  fetchMailStatus,
  syncMails,
} from '@/api/mails';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatOptionalDateTime } from '@/lib/format';

const PAGE_SIZE = 50;

type ScreenFilter = 'ALL' | ScreenResult;

const SCREEN_FILTERS: Array<{ value: ScreenFilter; label: string }> = [
  { value: 'ALL', label: '全部' },
  { value: 'RELEVANT', label: '相关' },
  { value: 'SUSPECT', label: '待确认' },
  { value: 'IRRELEVANT', label: '无关' },
];

const SCREEN_RESULT_LABELS: Record<ScreenResult, string> = {
  RELEVANT: '相关',
  SUSPECT: '待确认',
  IRRELEVANT: '无关',
};

const SCREEN_RESULT_STYLES: Record<ScreenResult, string> = {
  RELEVANT: 'bg-emerald-100 text-emerald-800',
  SUSPECT: 'bg-amber-100 text-amber-800',
  IRRELEVANT: 'bg-slate-100 text-slate-600',
};

function senderLabel(mail: EmailListItem | EmailDetail): string {
  return mail.fromName ? `${mail.fromName} <${mail.fromAddress}>` : mail.fromAddress;
}

function filterCount(
  filter: ScreenFilter,
  stats: {
    total: number;
    relevant: number;
    suspect: number;
    irrelevant: number;
  },
): number {
  switch (filter) {
    case 'RELEVANT':
      return stats.relevant;
    case 'SUSPECT':
      return stats.suspect;
    case 'IRRELEVANT':
      return stats.irrelevant;
    default:
      return stats.total;
  }
}

export function MailsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [screenFilter, setScreenFilter] = useState<ScreenFilter>('ALL');
  const [syncResult, setSyncResult] = useState<MailSyncResult | null>(null);

  const statusQuery = useQuery({
    queryKey: ['mails', 'status'],
    queryFn: fetchMailStatus,
  });
  const statsQuery = useQuery({
    queryKey: ['mails', 'screen-stats'],
    queryFn: fetchMailScreenStats,
  });
  const listQuery = useQuery({
    queryKey: ['mails', 'list', screenFilter],
    queryFn: () =>
      fetchMails({
        limit: PAGE_SIZE,
        offset: 0,
        screenResult: screenFilter === 'ALL' ? undefined : screenFilter,
      }),
  });
  const detailQuery = useQuery({
    queryKey: ['mails', 'detail', selectedId],
    queryFn: () => fetchMail(selectedId as string),
    enabled: Boolean(selectedId),
  });

  const syncMutation = useMutation({
    mutationFn: syncMails,
    onSuccess: (result) => {
      setSyncResult(result);
      void queryClient.invalidateQueries({ queryKey: ['mails'] });
    },
  });

  const status = statusQuery.data;
  const stats = statsQuery.data;
  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const selected = detailQuery.data;

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[1400px] flex-col gap-4 overflow-hidden p-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">邮件</h1>
          <p className="text-sm text-muted-foreground">
            同步原始邮件并按规则粗筛。修改规则后运行{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              pnpm --filter @job-harvester/server rescreen
            </code>
          </p>
        </div>
        <Button
          disabled={syncMutation.isPending || !status?.credentialsConfigured}
          onClick={() => syncMutation.mutate()}
        >
          {syncMutation.isPending ? '同步中…' : '同步邮件'}
        </Button>
      </div>

      <Card className="shrink-0">
        <CardContent className="flex flex-col gap-3 pt-6 text-sm">
          {statusQuery.isLoading ? <p>加载邮箱状态…</p> : null}
          {status?.credentialsConfigured ? (
            <p>
              当前账号：{status.address} · 回溯起点 {status.since} · 配置文件夹{' '}
              {status.folders.join('、')}
            </p>
          ) : (
            <p className="text-amber-700">
              尚未配置授权码。请在本机运行{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                pnpm --filter @job-harvester/server mail:set-credentials
              </code>
            </p>
          )}
          {stats ? (
            <p>
              粗筛统计：相关 {stats.relevant} · 待确认 {stats.suspect} · 无关{' '}
              {stats.irrelevant} · 共 {stats.total}
            </p>
          ) : null}
          {status?.syncStates.length ? (
            <p className="text-muted-foreground">
              各文件夹 lastUid：
              {status.syncStates
                .map((item) => `${item.folder}=${item.lastUid}`)
                .join('，')}
            </p>
          ) : null}
          {syncMutation.error ? (
            <p className="text-red-600">
              {syncMutation.error instanceof Error
                ? syncMutation.error.message
                : '同步失败'}
            </p>
          ) : null}
          {syncResult ? (
            <p>
              上次同步扫描 {syncResult.scannedFolders.join('、') || '无文件夹'}；拉取{' '}
              {syncResult.fetched}，新增 {syncResult.inserted}，跳过 {syncResult.skipped}
              ，失败 {syncResult.failed}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex shrink-0 flex-wrap gap-2">
        {SCREEN_FILTERS.map((item) => (
          <Button
            key={item.value}
            variant={screenFilter === item.value ? 'default' : 'secondary'}
            size="sm"
            onClick={() => {
              setScreenFilter(item.value);
              setSelectedId(null);
            }}
          >
            {item.label}
            {stats ? ` (${filterCount(item.value, stats)})` : ''}
          </Button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle>
              邮件列表（{total}
              {screenFilter !== 'ALL' && stats
                ? ` / ${filterCount(screenFilter, stats)}`
                : ''}
              ）
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto p-6 pt-0">
            {listQuery.isLoading ? <p className="text-sm">加载中…</p> : null}
            {listQuery.error ? (
              <p className="text-sm text-red-600">加载列表失败</p>
            ) : null}
            {!listQuery.isLoading && items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {screenFilter === 'ALL'
                  ? '还没有邮件，先点右上角同步。'
                  : '当前分类下没有邮件。'}
              </p>
            ) : (
              <div className="flex flex-col divide-y">
                {items.map((mail) => (
                  <button
                    key={mail.id}
                    type="button"
                    className={
                      selectedId === mail.id
                        ? 'bg-muted px-3 py-3 text-left'
                        : 'px-3 py-3 text-left hover:bg-muted/60'
                    }
                    onClick={() => setSelectedId(mail.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <span
                          className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${SCREEN_RESULT_STYLES[mail.screenResult]}`}
                        >
                          {SCREEN_RESULT_LABELS[mail.screenResult]}
                        </span>
                        <p className="font-medium">{mail.subject}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatOptionalDateTime(mail.receivedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {senderLabel(mail)} · {mail.folder}
                      {mail.hasAttachment ? ' · 有附件' : ''}
                    </p>
                    {mail.bodyPreview ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {mail.bodyPreview}
                      </p>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle>正文</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-6 pt-0">
            {!selectedId ? (
              <p className="text-sm text-muted-foreground">从左侧选择一封邮件查看正文。</p>
            ) : detailQuery.isLoading ? (
              <p className="text-sm">加载正文…</p>
            ) : selected ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                <div className="shrink-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-medium">{selected.subject}</h2>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${SCREEN_RESULT_STYLES[selected.screenResult]}`}
                    >
                      {SCREEN_RESULT_LABELS[selected.screenResult]}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{senderLabel(selected)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatOptionalDateTime(selected.receivedAt)} · {selected.folder}
                  </p>
                </div>
                {selected.attachments.length > 0 ? (
                  <p className="shrink-0 text-sm">
                    附件：
                    {selected.attachments.map((item) => item.filename).join('、')}
                  </p>
                ) : null}
                <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                  {selected.bodyText || '（无纯文本正文）'}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-red-600">邮件不存在</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
