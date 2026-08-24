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

export function DebriefPage() {
  const queryClient = useQueryClient();
  const [applicationId, setApplicationId] = useState('');
  const [rawDump, setRawDump] = useState('');
  const [questions, setQuestions] = useState<StructuredQuestion[]>([]);
  const [summary, setSummary] = useState<string | undefined>();
  const [probeMessages, setProbeMessages] = useState<ProbeMessage[]>([]);
  const [probeRound, setProbeRound] = useState(0);
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
      setSavedMessage(null);

      const needsProbe = result.questions.some(
        (item) => !item.myAnswer && !item.weakPoint,
      );
      if (needsProbe && applicationId) {
        const probe = await probeDebrief({
          rawDump,
          questions: result.questions,
          messages: [],
          round: 0,
        });
        if (probe.shouldContinue && probe.reply) {
          setProbeMessages([{ role: 'assistant', content: probe.reply }]);
          setProbeRound(1);
        }
        if (probe.updatedQuestions) {
          setQuestions(probe.updatedQuestions);
        }
      }
    },
  });

  const probeMutation = useMutation({
    mutationFn: probeDebrief,
    onSuccess: (result) => {
      if (result.updatedQuestions) {
        setQuestions(result.updatedQuestions);
      }
      if (result.shouldContinue && result.reply) {
        setProbeMessages((current) => [
          ...current,
          { role: 'assistant', content: result.reply },
        ]);
        setProbeRound((current) => current + 1);
      }
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
    },
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
              disabled={finalizeMutation.isPending}
            >
              {finalizeMutation.isPending ? '保存中…' : '保存到题库'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {probeMessages.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>克制追问（第 {probeRound}/3 轮）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {probeMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`rounded-lg p-3 text-sm ${
                    message.role === 'assistant'
                      ? 'bg-muted'
                      : 'border'
                  }`}
                >
                  {message.content}
                </div>
              ))}
            </div>
            {probeRound < 3 &&
            probeMessages[probeMessages.length - 1]?.role === 'assistant' ? (
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
