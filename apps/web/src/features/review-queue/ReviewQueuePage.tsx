import {
  EVENT_TYPE_LABELS,
  type ConfirmReviewInput,
  type ReviewQueueItem,
} from '@job-harvester/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  confirmReviewItem,
  fetchReviewQueue,
  ignoreReviewItem,
} from '@/api/review-queue';
import { fetchCompanies } from '@/api/applications';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  ApplicationForm,
  type ApplicationFormValues,
} from '@/features/applications/ApplicationForm';
import type { CreateApplicationInput, UpdateApplicationInput } from '@job-harvester/shared';

function toDateTimeLocalValue(value?: Date | string | null): string {
  if (!value) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ReviewItemCard({ item }: { item: ReviewQueueItem }) {
  const queryClient = useQueryClient();
  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
  });
  const [eventType, setEventType] = useState(item.eventType);
  const [occurredAt, setOccurredAt] = useState(toDateTimeLocalValue(item.occurredAt));
  const [deadlineAt, setDeadlineAt] = useState(toDateTimeLocalValue(item.deadlineAt));
  const [addWhitelist, setAddWhitelist] = useState(true);
  const [useSuggestedApplication, setUseSuggestedApplication] = useState(
    Boolean(item.suggestedApplicationId),
  );

  const confirmMutation = useMutation({
    mutationFn: (input: ConfirmReviewInput) =>
      confirmReviewItem(item.extractionId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });

  const ignoreMutation = useMutation({
    mutationFn: () => ignoreReviewItem(item.extractionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['review-queue'] });
    },
  });

  const needsDeadline =
    eventType === 'ASSESSMENT_INVITE' || eventType === 'EXAM_INVITE';

  async function handleQuickConfirm(): Promise<void> {
    if (!item.suggestedApplicationId) {
      return;
    }

    await confirmMutation.mutateAsync({
      applicationId: item.suggestedApplicationId,
      eventType,
      occurredAt: new Date(occurredAt),
      deadlineAt:
        needsDeadline && deadlineAt ? new Date(deadlineAt) : undefined,
      confirmedCompanyName: item.companyName,
      addSenderDomainToWhitelist: addWhitelist,
    });
  }

  async function handleConfirmApplication(
    values: CreateApplicationInput | UpdateApplicationInput,
  ): Promise<void> {
    const formValues = values as ApplicationFormValues;
    const payload: ConfirmReviewInput = {
      applicationId:
        useSuggestedApplication && item.suggestedApplicationId
          ? item.suggestedApplicationId
          : undefined,
      createApplication:
        useSuggestedApplication && item.suggestedApplicationId
          ? undefined
          : {
              companyId: formValues.companyId,
              companyName: formValues.companyName,
              businessUnit: formValues.businessUnit,
              position: formValues.position,
              batch: formValues.batch,
              channel: formValues.channel,
            },
      eventType,
      occurredAt: new Date(occurredAt),
      deadlineAt:
        needsDeadline && deadlineAt ? new Date(deadlineAt) : undefined,
      confirmedCompanyName: formValues.companyName ?? item.companyName,
      addSenderDomainToWhitelist: addWhitelist,
    };

    await confirmMutation.mutateAsync(payload);
  }

  const formInitialValues: Partial<ApplicationFormValues> = {
    companyName: item.companyName,
    businessUnit: item.businessUnit ?? '',
    position: item.position ?? '',
    batch: item.batch ?? '',
    stage: 'APPLIED',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{item.subject}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {item.fromName ?? item.fromAddress} ·{' '}
          {new Date(item.receivedAt).toLocaleString('zh-CN')} · 批次{' '}
          {item.batch ?? '（未识别）'} · 置信度{' '}
          {(item.confidence * 100).toFixed(0)}% · 匹配{' '}
          {item.matchMethod}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap">
          {item.bodyPreview}
        </p>

        <div className="grid gap-2">
          <Label htmlFor={`eventType-${item.extractionId}`}>事件类型</Label>
          <Select
            id={`eventType-${item.extractionId}`}
            value={eventType}
            onChange={(event) =>
              setEventType(event.target.value as ReviewQueueItem['eventType'])
            }
          >
            {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`occurredAt-${item.extractionId}`}>发生时间</Label>
            <Input
              id={`occurredAt-${item.extractionId}`}
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </div>
          {needsDeadline ? (
            <div className="grid gap-2">
              <Label htmlFor={`deadlineAt-${item.extractionId}`}>截止时间</Label>
              <Input
                id={`deadlineAt-${item.extractionId}`}
                type="datetime-local"
                required
                value={deadlineAt}
                onChange={(event) => setDeadlineAt(event.target.value)}
              />
            </div>
          ) : null}
        </div>

        {item.suggestedApplicationId ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useSuggestedApplication}
              onChange={(event) => setUseSuggestedApplication(event.target.checked)}
            />
            使用系统建议的投递（{item.suggestedApplicationId.slice(0, 8)}…）
          </label>
        ) : null}

        {!useSuggestedApplication ? (
          <ApplicationForm
            initialValues={formInitialValues}
            companies={companiesQuery.data ?? []}
            onSubmit={handleConfirmApplication}
            isSubmitting={confirmMutation.isPending}
            submitLabel="修正后确认"
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={confirmMutation.isPending}
              onClick={() => void handleQuickConfirm()}
            >
              一键确认
            </Button>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={addWhitelist}
            onChange={(event) => setAddWhitelist(event.target.checked)}
          />
          确认后将发件人域名加入粗筛白名单
        </label>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={ignoreMutation.isPending}
            onClick={() => void ignoreMutation.mutateAsync()}
          >
            忽略
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReviewQueuePage({ onBack }: { onBack?: () => void }) {
  const queueQuery = useQuery({
    queryKey: ['review-queue'],
    queryFn: fetchReviewQueue,
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">人工确认队列</h1>
          <p className="text-sm text-muted-foreground">
            低置信度或无法自动归并的邮件候选事件
          </p>
        </div>
        {onBack ? (
          <Button variant="secondary" onClick={onBack}>
            返回投递列表
          </Button>
        ) : null}
      </div>

      {queueQuery.isLoading ? <p>加载中…</p> : null}
      {queueQuery.error ? (
        <p className="text-sm text-red-600">加载失败，请稍后重试。</p>
      ) : null}

      {queueQuery.data?.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            当前没有待确认的候选事件
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {queueQuery.data?.map((item) => (
          <ReviewItemCard key={item.extractionId} item={item} />
        ))}
      </div>
    </div>
  );
}
