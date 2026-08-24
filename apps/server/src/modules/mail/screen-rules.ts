import fs from 'node:fs';
import path from 'node:path';

export type ScreenRules = {
  whitelistDomains: string[];
  blacklistDomains: string[];
  subjectKeywords: string[];
  bodyKeywords: string[];
};

const DEFAULT_RULES: ScreenRules = {
  whitelistDomains: [],
  blacklistDomains: [],
  subjectKeywords: ['笔试', '面试', '测评', 'offer', 'Offer', '简历', '招聘'],
  bodyKeywords: ['笔试', '面试', '测评', '截止时间', '邀请您'],
};

function resolveRulesPath(): string {
  const configured = process.env.SCREEN_RULES_PATH;
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(process.cwd(), '../../data/screen-rules.json');
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
    subjectKeywords: parsed.subjectKeywords ?? DEFAULT_RULES.subjectKeywords,
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
