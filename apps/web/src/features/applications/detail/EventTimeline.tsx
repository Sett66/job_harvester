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
import { DateInput } from '@/components/ui/date-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { parseLocalDate, toDateInputValue } from '@/lib/format';
import { cn } from '@/lib/utils';

export type EventFormProps = {
  onSubmit: (input: CreateEventInput) => Promise<void>;
  isSubmitting?: boolean;
};

export function EventForm({ onSubmit, isSubmitting = false }: EventFormProps) {
  const [type, setType] = useState<EventType>('APPLY');
  const [occurredAt, setOccurredAt] = useState(toDateInputValue(new Date()));
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
      occurredAt: parseLocalDate(occurredAt),
      source: 'MANUAL',
      deadlineAt:
        needsDeadline && deadlineAt ? parseLocalDate(deadlineAt) : undefined,
      scheduledAt:
        needsScheduled && scheduledAt ? parseLocalDate(scheduledAt) : undefined,
      round: needsRound ? Number(round) : undefined,
      rawText: rawText.trim() || undefined,
    });
    setRawText('');
    setDeadlineAt('');
    setScheduledAt('');
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
        <Label htmlFor="occurredAt">发生日期</Label>
        <DateInput
          id="occurredAt"
          required
          value={occurredAt}
          onChange={setOccurredAt}
        />
      </div>

      {needsDeadline ? (
        <div className="grid gap-2">
          <Label htmlFor="deadlineAt">截止日期</Label>
          <DateInput
            id="deadlineAt"
            required
            value={deadlineAt}
            onChange={setDeadlineAt}
          />
        </div>
      ) : null}

      {needsScheduled ? (
        <div className="grid gap-2">
          <Label htmlFor="scheduledAt">预约日期</Label>
          <DateInput
            id="scheduledAt"
            required
            value={scheduledAt}
            onChange={setScheduledAt}
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
  highlightedEventId,
}: {
  events: Event[];
  onDelete: (eventId: string) => void;
  highlightedEventId?: string | null;
}) {
  if (events.length === 0) {
    return <p className="text-muted-foreground">暂无事件</p>;
  }

  return (
    <ol className="space-y-4 border-l pl-4">
      {events.map((item) => {
        const highlighted = item.id === highlightedEventId;
        return (
          <li key={item.id} id={`event-${item.id}`} className="relative">
            <div className="absolute -left-[9px] top-2 h-2 w-2 rounded-full bg-primary" />
            <div
              className={cn(
                'rounded-lg border p-4 transition-colors',
                highlighted &&
                  'border-primary bg-accent/60 ring-2 ring-primary/30',
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">{EVENT_TYPE_LABELS[item.type]}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {new Date(item.occurredAt).toLocaleDateString('zh-CN')} ·{' '}
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
        );
      })}
    </ol>
  );
}
