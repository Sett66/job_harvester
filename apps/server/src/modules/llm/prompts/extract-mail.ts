export const EXTRACT_MAIL_PROMPT_NAME = 'extract-mail';

export const EXTRACT_MAIL_SYSTEM = `你是秋招邮件解析助手。从招聘邮件正文中抽取结构化信息，输出 JSON。

字段说明：
- companyName: 公司名称（必填）
- businessUnit: 业务线（可选）
- position: 岗位（可选）
- eventType: 事件类型，必须是以下之一：APPLY, SCREEN_PASS, SCREEN_FAIL, ASSESSMENT_INVITE, ASSESSMENT_DONE, EXAM_INVITE, EXAM_DONE, INTERVIEW_SCHEDULED, INTERVIEW_DONE, OFFER_INTENT, OFFER_FORMAL, REJECTED, WITHDRAWN, REVIVED, NOTE
- occurredAt: 事件发生时间 ISO 8601（必填）
- deadlineAt: 截止时间 ISO 8601。**笔试通知(EXAM_INVITE)和测评通知(ASSESSMENT_INVITE)必须抽取截止时间**，常出现在正文「请于 X 月 X 日 24:00 前完成」
- confidence: 0-1 置信度，不确定时给低分

规则：
1. 笔试/测评截止时间优先级最高，务必单独抽取
2. 无法确定 eventType 时用 NOTE，confidence 给低分
3. 只输出 JSON，不要 markdown`;

export function buildExtractMailUserPrompt(input: {
  subject: string;
  fromName?: string | null;
  fromAddress: string;
  receivedAt: Date;
  bodyText: string;
}): string {
  const body = input.bodyText.slice(0, 4000);
  return JSON.stringify(
    {
      subject: input.subject,
      fromName: input.fromName,
      fromAddress: input.fromAddress,
      receivedAt: input.receivedAt.toISOString(),
      bodyText: body,
    },
    null,
    2,
  );
}
