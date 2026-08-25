import fs from 'node:fs';
import path from 'node:path';

export type ScreenRules = {
  whitelistDomains: string[];
  blacklistDomains: string[];
  /** 主题或正文命中 → IRRELEVANT，优先于正向关键词 */
  excludeKeywords: string[];
  subjectKeywords: string[];
  /** 正文命中 → RELEVANT（比 bodyKeywords 更强） */
  bodyRelevantKeywords: string[];
  bodyKeywords: string[];
};

const DEFAULT_RULES: ScreenRules = {
  whitelistDomains: [],
  blacklistDomains: [],
  excludeKeywords: [
    '满意度',
    '满意度调研',
    '满意度调查',
    '体验调研',
    '面试反馈',
    '面试体验',
    'NPS',
    '请为本次',
    '请您评价',
    '请您评分',
  ],
  subjectKeywords: [
    '笔试',
    '面试通知',
    '面试邀请',
    '面试安排',
    '测评',
    'offer',
    'Offer',
    '简历',
    '招聘',
    '应聘',
    '投递成功',
    '收到申请',
    '申请已收到',
    '感谢您的申请',
    'talent',
    'campus',
  ],
  bodyRelevantKeywords: [
    '感谢投递',
    '感谢应聘',
    '收到您的申请',
    '已收到您的简历',
    '我们已收到',
    '成功投递',
  ],
  bodyKeywords: ['笔试', '面试', '测评', '截止时间', '邀请您'],
};

function resolveRulesPath(): string {
  const configured = process.env.SCREEN_RULES_PATH;
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(process.cwd(), '../../data/screen-rules.json');
}

export function ensureScreenRulesFile(): ScreenRules {
  const rulesPath = resolveRulesPath();
  if (!fs.existsSync(rulesPath)) {
    saveScreenRules(DEFAULT_RULES);
    return { ...DEFAULT_RULES };
  }
  return loadScreenRules();
}

export function loadScreenRules(): ScreenRules {
  const rulesPath = resolveRulesPath();
  if (!fs.existsSync(rulesPath)) {
    return { ...DEFAULT_RULES };
  }

  const raw = fs.readFileSync(rulesPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<ScreenRules>;
  return {
    whitelistDomains: parsed.whitelistDomains ?? [],
    blacklistDomains: parsed.blacklistDomains ?? [],
    excludeKeywords: parsed.excludeKeywords ?? DEFAULT_RULES.excludeKeywords,
    subjectKeywords: parsed.subjectKeywords ?? DEFAULT_RULES.subjectKeywords,
    bodyRelevantKeywords:
      parsed.bodyRelevantKeywords ?? DEFAULT_RULES.bodyRelevantKeywords,
    bodyKeywords: parsed.bodyKeywords ?? DEFAULT_RULES.bodyKeywords,
  };
}

export function saveScreenRules(rules: ScreenRules): void {
  const rulesPath = resolveRulesPath();
  fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
  fs.writeFileSync(rulesPath, `${JSON.stringify(rules, null, 2)}\n`, 'utf8');
}

export function addWhitelistDomain(domain: string): void {
  const normalized = domain.trim().toLowerCase();
  if (!normalized) {
    return;
  }

  const rules = loadScreenRules();
  if (rules.whitelistDomains.some((item) => item.toLowerCase() === normalized)) {
    return;
  }

  rules.whitelistDomains.push(normalized);
  saveScreenRules(rules);
}

export function extractDomainFromAddress(fromAddress: string): string | null {
  const match = fromAddress.match(/@([\w.-]+)/);
  return match?.[1]?.toLowerCase() ?? null;
}
