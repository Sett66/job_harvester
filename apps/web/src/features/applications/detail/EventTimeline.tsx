import {
  EVENT_SOURCE_LABELS,
  EVENT_TYPE_LABELS,
  eventTypeSchema,
  type CreateEventInput,
  type Event,
  type EventType,
} from '@job-harvester/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

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

function parseDateTimeLocal(value: string): Date {
  return new Date(value);
}

export type EventFormProps = {
  onSubmit: (input: CreateEventInput) => Promise<void>;
  isSubmitting?: boolean;
};

export function EventForm({ onSubmit, isSubmitting = false }: EventFormProps) {
  const [type, setType] = useState<EventType>('APPLY');
  const [occurredAt, setOccurredAt] = useState(
    toDateTimeLocalValue(new Date()),
  );
  const [deadlineAt, setDeadlineAt] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [round, setRound] = useState('1');
  const [rawText, setRawText] = useState('');

  const needsDeadline =
    type === 'ASSESSMENT_INVITE' || type === 'EXAM_INVITE';
  const needsScheduled = type === 'INTERVIEW_SCHEDULED';
  const needsRound = type === 'INTERVIEW_SCHEDULED';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      type,
      occurredAt: parseDateTimeLocal(occurredAt),
      source: 'MANUAL',
      deadlineAt: needsDeadline && deadlineAt ? parseDateTimeLocal(deadlineAt) : undefined,
      scheduledAt:
        needsScheduled && scheduledAt
          ? parseDateTimeLocal(scheduledAt)
          : undefined,
      round: needsRound ? Number(round) : undefined,
      rawText: rawText.trim() || undefined,
    });
    setRawText('');
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <Label htmlFor="eventType">事件类型</Label>
        <Select
          id="eventType"
          value={type}
          onChange={(event) => setType(event.target.value as EventType)}
        >
          {eventTypeSchema.options.map((option) => (
            <option key={option} value={option}>
              {EVENT_TYPE_LABELS[option]}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="occurredAt">发生时间</Label>
        <Input
          id="occurredAt"
          type="datetime-local"
          required
          value={occurredAt}
          onChange={(event) => setOccurredAt(event.target.value)}
        />
      </div>

      {needsDeadline ? (
        <div className="grid gap-2">
          <Label htmlFor="deadlineAt">截止时间</Label>
          <Input
            id="deadlineAt"
            type="datetime-local"
            required
            value={deadlineAt}
            onChange={(event) => setDeadlineAt(event.target.value)}
          />
        </div>
      ) : null}

      {needsScheduled ? (
        <div className="grid gap-2">
          <Label htmlFor="scheduledAt">预约时间</Label>
          <Input
            id="scheduledAt"
            type="datetime-local"
            required
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
          />
        </div>
      ) : null}

      {needsRound ? (
        <div className="grid gap-2">
          <Label htmlFor="round">轮次</Label>
          <Input
            id="round"
            type="number"
            min={1}
            required
            value={round}
            onChange={(event) => setRound(event.target.value)}
          />
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="rawText">原文</Label>
        <Input
          id="rawText"
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          placeholder="保留原始记录片段"
        />
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? '保存中…' : '添加事件'}
      </Button>
    </form>
  );
}

export function EventTimeline({
  events,
  onDelete,
}: {
  events: Event[];
  onDelete: (eventId: string) => void;
}) {
  if (events.length === 0) {
    return <p className="text-muted-foreground">暂无事件</p>;
  }

  return (
    <ol className="space-y-4 border-l pl-4">
      {events.map((item) => (
        <li key={item.id} className="relative">
          <div className="absolute -left-[9px] top-2 h-2 w-2 rounded-full bg-primary" />
          <div className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium">{EVENT_TYPE_LABELS[item.type]}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {new Date(item.occurredAt).toLocaleString('zh-CN')} ·{' '}
                  {EVENT_SOURCE_LABELS[item.source]}
                </div>
                {item.rawText ? (
                  <div className="mt-2 text-sm">{item.rawText}</div>
                ) : null}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (window.confirm('确定删除这条事件吗？')) {
                    onDelete(item.id);
                  }
                }}
              >
                删除
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
