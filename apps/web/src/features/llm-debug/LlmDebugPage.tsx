import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fetchLlmLogs, fetchLlmPrompts, runLlmDebug } from '@/api/llm';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export function LlmDebugPage() {
  const queryClient = useQueryClient();
  const [promptName, setPromptName] = useState('debug-extract');
  const [text, setText] = useState(
    '字节跳动 - 豆包 后端开发，薪资 25k-40k，联系人电话 13800138000。',
  );

  const promptsQuery = useQuery({
    queryKey: ['llm-prompts'],
    queryFn: fetchLlmPrompts,
  });
  const logsQuery = useQuery({
    queryKey: ['llm-logs'],
    queryFn: fetchLlmLogs,
  });

  const debugMutation = useMutation({
    mutationFn: () => runLlmDebug({ promptName, text }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['llm-logs'] });
    },
  });

  const selectedDescription = useMemo(() => {
    return promptsQuery.data?.find((item) => item.name === promptName)
      ?.description;
  }, [promptName, promptsQuery.data]);

  const result = debugMutation.data;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">LLM 调试</h1>
        <p className="text-sm text-muted-foreground">
          选择 prompt，输入任意文本，查看脱敏后的请求与结构化输出
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>调用</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="llm-prompt">Prompt</Label>
            <Select
              id="llm-prompt"
              value={promptName}
              onChange={(event) => setPromptName(event.target.value)}
            >
              {(promptsQuery.data ?? [{ name: 'debug-extract', description: '' }]).map(
                (prompt) => (
                  <option key={prompt.name} value={prompt.name}>
                    {prompt.name}
                  </option>
                ),
              )}
            </Select>
            {selectedDescription ? (
              <p className="text-sm text-muted-foreground">{selectedDescription}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="llm-input">输入文本</Label>
            <textarea
              id="llm-input"
              className="flex min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>

          <div>
            <Button
              disabled={debugMutation.isPending || text.trim().length === 0}
              onClick={() => debugMutation.mutate()}
            >
              {debugMutation.isPending ? '调用中…' : '运行'}
            </Button>
          </div>

          {debugMutation.error ? (
            <p className="text-sm text-red-600">
              {debugMutation.error instanceof Error
                ? debugMutation.error.message
                : '调用失败'}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {result ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>脱敏后发给模型的文本</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto whitespace-pre-wrap text-sm">
                {result.redactedUser}
              </pre>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{result.ok ? '结构化输出' : '失败结果'}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {result.ok ? (
                <pre className="overflow-auto whitespace-pre-wrap text-sm">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-red-600">{result.error}</p>
              )}
              {result.raw ? (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">原始响应</p>
                  <pre className="overflow-auto whitespace-pre-wrap text-sm text-muted-foreground">
                    {result.raw}
                  </pre>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>调用日志</CardTitle>
        </CardHeader>
        <CardContent>
          {logsQuery.isLoading ? <p className="text-sm">加载中…</p> : null}
          {logsQuery.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无调用记录</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 pr-3 font-medium">Prompt</th>
                    <th className="py-2 pr-3 font-medium">成败</th>
                    <th className="py-2 pr-3 font-medium">耗时</th>
                    <th className="py-2 pr-3 font-medium">Token</th>
                    <th className="py-2 font-medium">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {logsQuery.data?.map((log, index) => (
                    <tr key={`${log.createdAt}-${index}`} className="border-b last:border-0">
                      <td className="py-2 pr-3">{log.promptName}</td>
                      <td className="py-2 pr-3">
                        {log.success ? '成功' : `失败${log.error ? `：${log.error}` : ''}`}
                      </td>
                      <td className="py-2 pr-3">{log.durationMs}ms</td>
                      <td className="py-2 pr-3">
                        {log.promptTokens ?? 0} + {log.completionTokens ?? 0}
                      </td>
                      <td className="py-2">{log.createdAt.replace('T', ' ').slice(0, 19)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
