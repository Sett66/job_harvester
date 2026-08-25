import type { EmailDetail, EmailListItem, MailSyncResult } from '@job-harvester/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchMail, fetchMails, fetchMailStatus, syncMails } from '@/api/mails';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatOptionalDateTime } from '@/lib/format';

const PAGE_SIZE = 50;

function senderLabel(mail: EmailListItem | EmailDetail): string {
  return mail.fromName ? `${mail.fromName} <${mail.fromAddress}>` : mail.fromAddress;
}

export function MailsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<MailSyncResult | null>(null);

  const statusQuery = useQuery({
    queryKey: ['mails', 'status'],
    queryFn: fetchMailStatus,
  });
  const listQuery = useQuery({
    queryKey: ['mails', 'list'],
    queryFn: () => fetchMails({ limit: PAGE_SIZE, offset: 0 }),
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
  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const selected = detailQuery.data;

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[1400px] flex-col gap-4 overflow-hidden p-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">邮件</h1>
          <p className="text-sm text-muted-foreground">
            从 QQ 邮箱拉取原始邮件入库。本页不做解析和分类。
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
        <CardContent className="flex flex-col gap-2 pt-6 text-sm">
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

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle>邮件列表（{total}）</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto p-6 pt-0">
            {listQuery.isLoading ? <p className="text-sm">加载中…</p> : null}
            {listQuery.error ? (
              <p className="text-sm text-red-600">加载列表失败</p>
            ) : null}
            {!listQuery.isLoading && items.length === 0 ? (
              <p className="text-sm text-muted-foreground">还没有邮件，先点右上角同步。</p>
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
                      <p className="font-medium">{mail.subject}</p>
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
                  <h2 className="text-lg font-medium">{selected.subject}</h2>
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
