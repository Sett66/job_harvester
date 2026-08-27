import type { StructuredQuestion } from '@job-harvester/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fetchApplicationsGrouped } from '@/api/applications';
import {
  finalizeDebrief,
  probeDebrief,
  structureDebrief,
  type ProbeMessage,
} from '@/api/interviews';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';

function mergeQuestionUpdates(
  current: StructuredQuestion[],
  updates: StructuredQuestion[] | undefined,
): StructuredQuestion[] {
  if (!updates?.length) {
    return current;
  }
  if (updates.length !== current.length) {
    return updates.every((item) => item.text?.trim())
      ? updates
      : current.map((item, index) => ({
          ...item,
          ...updates[index],
          text: updates[index]?.text?.trim() ? updates[index].text : item.text,
        }));
  }
  return current.map((item, index) => {
    const update = updates[index];
    if (!update) {
      return item;
    }
    return {
      ...item,
      ...update,
      text: update.text?.trim() ? update.text : item.text,
    };
  });
}

function getSaveBlockReason(input: {
  questions: StructuredQuestion[];
  applicationId: string;
  rawDump: string;
}): string | null {
  if (input.questions.length === 0) {
    return '结构化结果已丢失，请重新点击「结构化」。';
  }
  if (!input.applicationId) {
    return '请先选择关联投递，再保存到题库。';
  }
  if (!input.rawDump.trim()) {
    return '原始文本为空，请重新粘贴后再保存。';
  }
  return null;
}

export function DebriefPage() {
  const queryClient = useQueryClient();
  const [applicationId, setApplicationId] = useState('');
  const [rawDump, setRawDump] = useState('');
  const [questions, setQuestions] = useState<StructuredQuestion[]>([]);
  const [summary, setSummary] = useState<string | undefined>();
  const [probeMessages, setProbeMessages] = useState<ProbeMessage[]>([]);
  const [probeRound, setProbeRound] = useState(0);
  const [probeFinished, setProbeFinished] = useState(false);
  const [probeError, setProbeError] = useState(false);
  const [probeInput, setProbeInput] = useState('');
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const groupedQuery = useQuery({
    queryKey: ['applications', 'grouped'],
    queryFn: fetchApplicationsGrouped,
  });

  const applicationOptions = useMemo(
    () =>
      (groupedQuery.data ?? []).flatMap((group) =>
        group.applications.map((application) => ({
          id: application.id,
          label: `${group.company.canonicalName} · ${application.businessUnit || '（无业务线）'} · ${application.batch}`,
        })),
      ),
    [groupedQuery.data],
  );

  const structureMutation = useMutation({
    mutationFn: structureDebrief,
    onSuccess: async (result) => {
      setQuestions(result.questions);
      setSummary(result.summary);
      setProbeMessages([]);
      setProbeRound(0);
      setProbeFinished(false);
      setProbeError(false);
      setSavedMessage(null);

      const needsProbe = result.questions.some(
        (item) => !item.myAnswer && !item.weakPoint,
      );
      if (needsProbe && applicationId) {
        try {
          const probe = await probeDebrief({
            rawDump,
            questions: result.questions,
            messages: [],
            round: 0,
          });
          if (probe.updatedQuestions) {
            setQuestions((current) =>
              mergeQuestionUpdates(result.questions, probe.updatedQuestions),
            );
          }
          if (probe.shouldContinue && probe.reply) {
            setProbeMessages([{ role: 'assistant', content: probe.reply }]);
            setProbeRound(1);
            setProbeFinished(false);
          } else {
            setProbeFinished(true);
          }
        } catch {
          setProbeError(true);
          setProbeFinished(true);
        }
      }
    },
  });

  const probeMutation = useMutation({
    mutationFn: probeDebrief,
    onSuccess: (result) => {
      setProbeError(false);
      if (result.updatedQuestions) {
        setQuestions((current) =>
          mergeQuestionUpdates(current, result.updatedQuestions),
        );
      }
      if (result.shouldContinue && result.reply) {
        setProbeMessages((current) => [
          ...current,
          { role: 'assistant', content: result.reply },
        ]);
        setProbeRound((current) => current + 1);
        setProbeFinished(false);
      } else {
        setProbeFinished(true);
      }
      setProbeInput('');
    },
    onError: () => {
      setProbeError(true);
      setProbeFinished(true);
      setProbeInput('');
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: finalizeDebrief,
    onSuccess: (result) => {
      setSavedMessage(
        `已保存 ${result.questions.length} 条题目，Markdown 路径：${result.interviewNote.mdPath}`,
      );
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
      setRawDump('');
      setQuestions([]);
      setProbeMessages([]);
      setProbeRound(0);
      setProbeFinished(false);
      setProbeError(false);
    },
  });

  const awaitingUserReply =
    !probeFinished &&
    probeRound < 3 &&
    probeMessages[probeMessages.length - 1]?.role === 'assistant';

  const canSave =
    questions.length > 0 && Boolean(applicationId) && Boolean(rawDump.trim());
  const saveBlockReason = getSaveBlockReason({
    questions,
    applicationId,
    rawDump,
  });

  async function handleStructure() {
    if (!applicationId || !rawDump.trim()) {
      return;
    }
    await structureMutation.mutateAsync({
      applicationId,
      rawDump: rawDump.trim(),
    });
  }

  async function handleProbeSubmit() {
    if (!probeInput.trim() || probeRound >= 3) {
      return;
    }
    const nextMessages: ProbeMessage[] = [
      ...probeMessages,
      { role: 'user', content: probeInput.trim() },
    ];
    setProbeMessages(nextMessages);
    await probeMutation.mutateAsync({
      rawDump,
      questions,
      messages: nextMessages,
      round: probeRound,
    });
  }

  async function handleFinalize() {
    if (!applicationId || !rawDump.trim() || questions.length === 0) {
      return;
    }
    await finalizeMutation.mutateAsync({
      applicationId,
      rawDump: rawDump.trim(),
      summary,
      questions,
    });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">面试复盘录入</h1>
        <p className="mt-2 text-muted-foreground">
          随手倒一段口语化文本，系统自动结构化；追问最多 3 轮
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>关联投递</CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="application">投递记录</Label>
          <select
            id="application"
            className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={applicationId}
            onChange={(event) => setApplicationId(event.target.value)}
          >
            <option value="">请选择投递</option>
            {applicationOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>随手倒文本</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            className="min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="例如：问了 MySQL 索引、Redis 缓存穿透、我项目那个消息队列为啥选 Kafka，第三个答崩了"
            value={rawDump}
            onChange={(event) => setRawDump(event.target.value)}
          />
          <Button
            onClick={() => void handleStructure()}
            disabled={
              !applicationId ||
              !rawDump.trim() ||
              structureMutation.isPending
            }
          >
            {structureMutation.isPending ? '结构化中…' : '结构化'}
          </Button>
        </CardContent>
      </Card>

      {questions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>结构化结果（{questions.length} 条）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary ? (
              <p className="text-sm text-muted-foreground">摘要：{summary}</p>
            ) : null}
            {questions.map((item, index) => (
              <div key={`${item.text}-${index}`} className="rounded-lg border p-4">
                <div className="font-medium">
                  {index + 1}. {item.text}
                </div>
                {item.category ? (
                  <div className="mt-1 text-sm text-muted-foreground">
                    分类：{item.category}
                  </div>
                ) : null}
                {item.myAnswer ? (
                  <div className="mt-1 text-sm">我的回答：{item.myAnswer}</div>
                ) : null}
                {item.weakPoint ? (
                  <div className="mt-1 text-sm text-destructive">
                    薄弱点：{item.weakPoint}
                  </div>
                ) : null}
              </div>
            ))}
            <Button
              onClick={() => void handleFinalize()}
              disabled={finalizeMutation.isPending || !canSave}
            >
              {finalizeMutation.isPending ? '保存中…' : '保存到题库'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {probeMessages.length > 0 || probeFinished || probeError ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {probeFinished
                ? '追问已结束'
                : `克制追问（第 ${probeRound}/3 轮）`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {probeMessages.length > 0 ? (
              <div className="space-y-2">
                {probeMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`rounded-lg p-3 text-sm ${
                      message.role === 'assistant' ? 'bg-muted' : 'border'
                    }`}
                  >
                    {message.content}
                  </div>
                ))}
              </div>
            ) : null}
            {probeMutation.isPending ? (
              <p className="text-sm text-muted-foreground">正在处理你的回复…</p>
            ) : null}
            {probeError ? (
              <p className="text-sm text-destructive">
                {canSave
                  ? '追问请求失败，可以直接保存到题库，或稍后重试。'
                  : '追问请求失败。'}
              </p>
            ) : null}
            {probeFinished && !probeError ? (
              <p className="text-sm text-muted-foreground">
                信息已足够，可以保存到题库。
              </p>
            ) : null}
            {canSave && (probeFinished || probeError) ? (
              <Button
                onClick={() => void handleFinalize()}
                disabled={finalizeMutation.isPending}
              >
                {finalizeMutation.isPending ? '保存中…' : '保存到题库'}
              </Button>
            ) : null}
            {probeError && saveBlockReason ? (
              <p className="text-sm text-muted-foreground">{saveBlockReason}</p>
            ) : null}
            {awaitingUserReply && !probeMutation.isPending ? (
              <>
                <textarea
                  className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="补充你当时的回答或卡住的点"
                  value={probeInput}
                  onChange={(event) => setProbeInput(event.target.value)}
                />
                <Button
                  onClick={() => void handleProbeSubmit()}
                  disabled={!probeInput.trim() || probeMutation.isPending}
                >
                  回复追问
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {savedMessage ? (
        <p className="text-sm text-green-700">{savedMessage}</p>
      ) : null}
    </div>
  );
}
