import {
  BALL_LABELS,
  CHANNELS,
  INTERVIEW_TYPE_LABELS,
  OUTCOME_LABELS,
  STAGE_LABELS,
  type Ball,
  type Channel,
  type CreateApplicationInput,
  type InterviewType,
  type Outcome,
  type Stage,
  type UpdateApplicationInput,
} from '@job-harvester/shared';
import type { Company } from '@job-harvester/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { parseLocalDate, toDateInputValue } from '@/lib/format';

export type ApplicationFormValues = {
  companyId?: string;
  companyName?: string;
  businessUnit?: string;
  position?: string;
  batch: string;
  channel?: Channel;
  appliedAt?: string;
  stage: Stage;
  ball?: Ball | '';
  outcome?: Outcome | '';
  currentRound?: number;
  currentInterviewType?: InterviewType | '';
  nextDeadlineAt?: string;
  note?: string;
};

const defaultValues: ApplicationFormValues = {
  companyId: '',
  companyName: '',
  businessUnit: '',
  position: '',
  batch: '',
  channel: undefined,
  appliedAt: '',
  stage: 'APPLIED',
  ball: '',
  outcome: '',
  currentRound: 0,
  currentInterviewType: '',
  nextDeadlineAt: '',
  note: '',
};

function parseOptionalDate(value?: string): Date | null | undefined {
  if (value == null) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return parseLocalDate(trimmed);
}

export type ApplicationFormProps = {
  mode?: 'create' | 'edit';
  initialValues?: Partial<ApplicationFormValues>;
  companies?: Company[];
  onSubmit: (
    values: CreateApplicationInput | UpdateApplicationInput,
  ) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  duplicateWarning?: string | null;
};

export function ApplicationForm({
  mode = 'create',
  initialValues,
  companies = [],
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitLabel,
  duplicateWarning,
}: ApplicationFormProps) {
  const [form, setForm] = useState<ApplicationFormValues>({
    ...defaultValues,
    ...initialValues,
  });
  const [useExistingCompany, setUseExistingCompany] = useState(
    mode === 'edit' || Boolean(initialValues?.companyId),
  );

  useEffect(() => {
    setForm({ ...defaultValues, ...initialValues });
    setUseExistingCompany(mode === 'edit' || Boolean(initialValues?.companyId));
  }, [initialValues, mode]);

  const stageNeedsBall =
    form.stage !== 'OFFER' && form.stage !== 'CLOSED';
  const stageNeedsOutcome = form.stage === 'CLOSED';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payloadBase = {
      businessUnit: form.businessUnit?.trim() || undefined,
      position: form.position?.trim() || undefined,
      batch: form.batch.trim(),
      channel: form.channel || undefined,
      appliedAt: parseOptionalDate(form.appliedAt),
      stage: form.stage,
      ball: stageNeedsBall ? form.ball || null : null,
      outcome: stageNeedsOutcome ? form.outcome || null : null,
      currentRound: form.currentRound ?? 0,
      currentInterviewType: form.currentInterviewType || null,
      nextDeadlineAt: parseOptionalDate(form.nextDeadlineAt),
      note: form.note?.trim() || undefined,
    };

    if (mode === 'edit') {
      await onSubmit(payloadBase as UpdateApplicationInput);
      return;
    }

    await onSubmit({
      ...payloadBase,
      companyId: useExistingCompany ? form.companyId || undefined : undefined,
      companyName: useExistingCompany
        ? undefined
        : form.companyName?.trim() || undefined,
    } as CreateApplicationInput);
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      {mode === 'create' ? (
        <div className="grid gap-3">
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={useExistingCompany}
                onChange={() => setUseExistingCompany(true)}
              />
              选择已有公司
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={!useExistingCompany}
                onChange={() => setUseExistingCompany(false)}
              />
              输入新公司
            </label>
          </div>
          {useExistingCompany ? (
            <div className="grid gap-2">
              <Label htmlFor="companyId">公司 *</Label>
              <Select
                id="companyId"
                required
                value={form.companyId ?? ''}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    companyId: event.target.value,
                  }))
                }
              >
                <option value="">请选择公司</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.canonicalName}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="companyName">公司名称 *</Label>
              <Input
                id="companyName"
                required
                value={form.companyName ?? ''}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    companyName: event.target.value,
                  }))
                }
              />
            </div>
          )}
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="businessUnit">业务线</Label>
        <Input
          id="businessUnit"
          value={form.businessUnit ?? ''}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              businessUnit: event.target.value,
            }))
          }
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="batch">批次 *</Label>
        <Input
          id="batch"
          required
          value={form.batch}
          onChange={(event) =>
            setForm((current) => ({ ...current, batch: event.target.value }))
          }
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="position">岗位</Label>
        <Input
          id="position"
          value={form.position ?? ''}
          onChange={(event) =>
            setForm((current) => ({ ...current, position: event.target.value }))
          }
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="channel">渠道</Label>
        <Select
          id="channel"
          value={form.channel ?? ''}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              channel: (event.target.value || undefined) as Channel | undefined,
            }))
          }
        >
          <option value="">未填写</option>
          {CHANNELS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="appliedAt">投递日期</Label>
        <DateInput
          id="appliedAt"
          value={form.appliedAt ?? ''}
          onChange={(appliedAt) =>
            setForm((current) => ({
              ...current,
              appliedAt,
            }))
          }
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="stage">环节 *</Label>
        <Select
          id="stage"
          required
          value={form.stage}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              stage: event.target.value as Stage,
              ball:
                event.target.value === 'OFFER' || event.target.value === 'CLOSED'
                  ? ''
                  : current.ball,
              outcome: event.target.value === 'CLOSED' ? current.outcome : '',
            }))
          }
        >
          {(Object.keys(STAGE_LABELS) as Stage[]).map((option) => (
            <option key={option} value={option}>
              {STAGE_LABELS[option]}
            </option>
          ))}
        </Select>
      </div>

      {stageNeedsBall ? (
        <div className="grid gap-2">
          <Label htmlFor="ball">球在谁手里</Label>
          <Select
            id="ball"
            value={form.ball ?? ''}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                ball: event.target.value as Ball | '',
              }))
            }
          >
            <option value="">未填写</option>
            {(Object.keys(BALL_LABELS) as Ball[]).map((option) => (
              <option key={option} value={option}>
                {BALL_LABELS[option]}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {stageNeedsOutcome ? (
        <div className="grid gap-2">
          <Label htmlFor="outcome">结束原因</Label>
          <Select
            id="outcome"
            value={form.outcome ?? ''}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                outcome: event.target.value as Outcome | '',
              }))
            }
          >
            <option value="">未填写</option>
            {(Object.keys(OUTCOME_LABELS) as Outcome[]).map((option) => (
              <option key={option} value={option}>
                {OUTCOME_LABELS[option]}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="currentRound">面试轮次</Label>
          <Input
            id="currentRound"
            type="number"
            min={0}
            value={form.currentRound ?? 0}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                currentRound: Number(event.target.value),
              }))
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="currentInterviewType">面试类型</Label>
          <Select
            id="currentInterviewType"
            value={form.currentInterviewType ?? ''}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                currentInterviewType: event.target.value as InterviewType | '',
              }))
            }
          >
            <option value="">未填写</option>
            {(Object.keys(INTERVIEW_TYPE_LABELS) as InterviewType[]).map(
              (option) => (
                <option key={option} value={option}>
                  {INTERVIEW_TYPE_LABELS[option]}
                </option>
              ),
            )}
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="note">备注</Label>
        <Input
          id="note"
          value={form.note ?? ''}
          onChange={(event) =>
            setForm((current) => ({ ...current, note: event.target.value }))
          }
        />
      </div>

      {duplicateWarning ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {duplicateWarning}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '保存中…' : submitLabel ?? '保存'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            取消
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function applicationToFormValues(
  application: import('@job-harvester/shared').Application,
): ApplicationFormValues {
  return {
    companyId: application.companyId,
    businessUnit: application.businessUnit ?? '',
    position: application.position ?? '',
    batch: application.batch,
    channel: application.channel ?? undefined,
    appliedAt: toDateInputValue(application.appliedAt),
    stage: application.stage,
    ball: application.ball ?? '',
    outcome: application.outcome ?? '',
    currentRound: application.currentRound,
    currentInterviewType: application.currentInterviewType ?? '',
    nextDeadlineAt: toDateInputValue(application.nextDeadlineAt),
    note: application.note ?? '',
  };
}
