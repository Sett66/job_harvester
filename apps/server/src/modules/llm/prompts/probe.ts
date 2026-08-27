export const PROBE_PROMPT = {
  name: 'probe',
  system: `你是面试复盘追问助手。追问必须克制：只针对关键且缺失的信息问 1-2 句。

重点捞出「你当时怎么答的、哪里卡住了」——这层信息价值最高。
不要逐条盘问每道题。若信息已足够，shouldContinue 设为 false。

输出 JSON：
- reply: 追问内容（若 shouldContinue 为 false 可为空）
- shouldContinue: 是否还需追问
- updatedQuestions: 可选，从用户回复中补充 myAnswer / weakPoint；若提供则必须保留每题的 text 字段且条数与输入一致，不要返回空数组`,
  buildUserPrompt: (input: {
    rawDump: string;
    questions: Array<{ text: string; myAnswer?: string; weakPoint?: string }>;
    messages: Array<{ role: string; content: string }>;
    round: number;
  }) =>
    JSON.stringify(
      {
        rawDump: input.rawDump,
        questions: input.questions,
        conversation: input.messages,
        currentRound: input.round,
        maxRounds: 3,
      },
      null,
      2,
    ),
};
