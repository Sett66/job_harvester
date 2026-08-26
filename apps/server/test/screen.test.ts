import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/database.provider';
import { email } from '../src/db/schema';
import {
  computeScreenResult,
  domainMatches,
  ScreenService,
} from '../src/modules/mail/screen.service';
import type { ScreenRules } from '../src/modules/mail/screen-rules';

const RULES: ScreenRules = {
  whitelistDomains: ['moka.com'],
  blacklistDomains: ['newsletter.example.com'],
  excludeKeywords: ['满意度', '面试反馈'],
  subjectKeywords: ['笔试', '面试通知', '测评', '投递成功'],
  bodyRelevantKeywords: ['感谢投递', '收到您的申请'],
  bodyKeywords: ['邀请您', '截止时间'],
};

describe('computeScreenResult', () => {
  it('marks blacklist domains as IRRELEVANT', () => {
    expect(
      computeScreenResult(
        {
          fromAddress: 'Promo <promo@newsletter.example.com>',
          subject: 'Weekly digest',
          bodyText: 'nothing here',
        },
        RULES,
      ),
    ).toBe('IRRELEVANT');
  });

  it('marks whitelist domains as RELEVANT', () => {
    expect(
      computeScreenResult(
        {
          fromAddress: 'HR <noreply@hr.moka.com>',
          subject: 'Application update',
          bodyText: 'plain body',
        },
        RULES,
      ),
    ).toBe('RELEVANT');
  });

  it('marks subject keyword matches as RELEVANT', () => {
    expect(
      computeScreenResult(
        {
          fromAddress: 'HR <hr@unknown.com>',
          subject: '【字节】笔试通知',
          bodyText: '请查收',
        },
        RULES,
      ),
    ).toBe('RELEVANT');
  });

  it('marks body keyword matches as SUSPECT', () => {
    expect(
      computeScreenResult(
        {
          fromAddress: 'HR <hr@unknown.com>',
          subject: 'Application update',
          bodyText: '我们邀请您参加下一轮流程，请于截止时间前完成。',
        },
        RULES,
      ),
    ).toBe('SUSPECT');
  });

  it('marks satisfaction surveys as IRRELEVANT even when subject mentions 面试', () => {
    expect(
      computeScreenResult(
        {
          fromAddress: 'HR <hr@unknown.com>',
          subject: '【字节】面试满意度调研',
          bodyText: '请为本次面试体验打分',
        },
        RULES,
      ),
    ).toBe('IRRELEVANT');
  });

  it('marks application received emails as RELEVANT via body keywords', () => {
    expect(
      computeScreenResult(
        {
          fromAddress: 'HR <hr@unknown.com>',
          subject: 'Application update',
          bodyText: '感谢投递，我们已收到您的申请，请耐心等待。',
        },
        RULES,
      ),
    ).toBe('RELEVANT');
  });

  it('marks application received emails as RELEVANT via subject keywords', () => {
    expect(
      computeScreenResult(
        {
          fromAddress: 'HR <hr@unknown.com>',
          subject: '投递成功 - 字节跳动',
          bodyText: '您的申请已进入流程。',
        },
        RULES,
      ),
    ).toBe('RELEVANT');
  });

  it('still marks interview invitations as RELEVANT', () => {
    expect(
      computeScreenResult(
        {
          fromAddress: 'HR <hr@unknown.com>',
          subject: '【字节】面试通知',
          bodyText: '邀请您于本周五参加面试。',
        },
        RULES,
      ),
    ).toBe('RELEVANT');
  });

  it('defaults to SUSPECT when no rule matches', () => {
    expect(
      computeScreenResult(
        {
          fromAddress: 'Friend <friend@example.com>',
          subject: '周末吃饭吗',
          bodyText: '随便聊聊',
        },
        RULES,
      ),
    ).toBe('SUSPECT');
  });

  it('applies blacklist before whitelist', () => {
    expect(
      computeScreenResult(
        {
          fromAddress: 'Spam <bad@newsletter.example.com>',
          subject: '笔试通知',
          bodyText: '邀请您参加',
        },
        {
          ...RULES,
          whitelistDomains: ['newsletter.example.com'],
        },
      ),
    ).toBe('IRRELEVANT');
  });
});

describe('domainMatches', () => {
  it('matches exact and subdomain patterns', () => {
    expect(domainMatches('moka.com', 'moka.com')).toBe(true);
    expect(domainMatches('hr.moka.com', 'moka.com')).toBe(true);
    expect(domainMatches('notmoka.com', 'moka.com')).toBe(false);
  });
});

describe('ScreenService', () => {
  let rulesPath: string;
  const originalRulesPath = process.env.SCREEN_RULES_PATH;

  beforeEach(() => {
    rulesPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'jh-screen-')),
      'screen-rules.json',
    );
    process.env.SCREEN_RULES_PATH = rulesPath;
    fs.writeFileSync(
      rulesPath,
      `${JSON.stringify(RULES, null, 2)}\n`,
      'utf8',
    );
  });

  afterEach(() => {
    if (originalRulesPath === undefined) {
      delete process.env.SCREEN_RULES_PATH;
    } else {
      process.env.SCREEN_RULES_PATH = originalRulesPath;
    }
    fs.rmSync(path.dirname(rulesPath), { recursive: true, force: true });
  });

  it('rescreens all emails without touching original body fields', async () => {
    const db = createDatabase(':memory:');
    const service = new ScreenService(db);
    const receivedAt = new Date('2026-03-01T08:00:00.000Z');
    const createdAt = new Date('2026-03-01T08:00:00.000Z');

    await db.insert(email).values([
      {
        id: 'mail-1',
        messageId: '<1@example.com>',
        folder: 'INBOX',
        fromName: 'HR',
        fromAddress: 'hr@unknown.com',
        subject: '周末聚餐',
        receivedAt,
        bodyText: '随便聊聊',
        bodyHtmlPath: '/tmp/mail-1.html',
        hasAttachment: false,
        screenResult: 'RELEVANT',
        parseStatus: 'PENDING',
        reviewStatus: 'NEEDS_REVIEW',
        createdAt,
      },
      {
        id: 'mail-2',
        messageId: '<2@example.com>',
        folder: 'INBOX',
        fromName: 'HR',
        fromAddress: 'hr@unknown.com',
        subject: '笔试安排',
        receivedAt,
        bodyText: '请于本周完成',
        bodyHtmlPath: '/tmp/mail-2.html',
        hasAttachment: false,
        screenResult: 'SUSPECT',
        parseStatus: 'PENDING',
        reviewStatus: 'NEEDS_REVIEW',
        createdAt,
      },
    ]);

    const result = await service.rescreenAll();
    const rows = await db.select().from(email).orderBy(email.id);

    expect(result.processed).toBe(2);
    expect(result.stats.relevant).toBe(1);
    expect(result.stats.suspect).toBe(1);
    expect(rows[0]?.screenResult).toBe('SUSPECT');
    expect(rows[1]?.screenResult).toBe('RELEVANT');
    expect(rows[0]?.bodyText).toBe('随便聊聊');
    expect(rows[0]?.bodyHtmlPath).toBe('/tmp/mail-1.html');
    expect(rows[1]?.bodyText).toBe('请于本周完成');
    expect(rows[1]?.bodyHtmlPath).toBe('/tmp/mail-2.html');
  });
});
