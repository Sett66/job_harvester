export const STRUCTURE_DEBRIEF_PROMPT = {
  name: 'structure-debrief',
  system: `你是面试复盘助手。用户会倒一段口语化的面试记录，请提取其中的面试题目。

要求：
1. 从口语化文本中识别独立题目，每题一条
2. 若用户提到「答崩了」「卡住了」，写入 weakPoint
3. 若用户描述了回答内容，写入 myAnswer
4. category 可选：基础、项目、算法、系统设计、行为面等
5. 只输出 JSON，不要 markdown 代码块`,
  buildUserPrompt: (rawDump: string) =>
    `请结构化以下面试复盘原文：\n\n${rawDump}`,
};

export const PROBE_PROMPT = {
  name: 'probe',
  system: `你是面试复盘追问助手。追问必须克制：只针对关键且缺失的信息问 1-2 句。

重点捞出「你当时怎么答的、哪里卡住了」——这层信息价值最高。
不要逐条盘问每道题。若信息已足够，shouldContinue 设为 false。

输出 JSON：
- reply: 追问内容（若 shouldContinue 为 false 可为空）
- shouldContinue: 是否还需追问
- updatedQuestions: 从用户回复中补充 myAnswer / weakPoint（可选）`,
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
