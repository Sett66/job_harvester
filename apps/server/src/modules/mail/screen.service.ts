import { Inject, Injectable } from '@nestjs/common';
import type { MailScreenStats, ScreenResult } from '@job-harvester/shared';
import { eq, sql } from 'drizzle-orm';
import { DATABASE, type AppDatabase } from '../../db/database.provider';
import { email } from '../../db/schema';
import {
  extractDomainFromAddress,
  loadScreenRules,
  type ScreenRules,
} from './screen-rules';

export type ScreenEmailInput = {
  fromAddress: string;
  subject: string;
  bodyText: string;
};

export type RescreenResult = {
  processed: number;
  stats: MailScreenStats;
};

export function domainMatches(domain: string, pattern: string): boolean {
  const normalizedDomain = domain.trim().toLowerCase();
  const normalizedPattern = pattern.trim().toLowerCase();
  if (!normalizedDomain || !normalizedPattern) {
    return false;
  }
  return (
    normalizedDomain === normalizedPattern ||
    normalizedDomain.endsWith(`.${normalizedPattern}`)
  );
}

export function containsAnyKeyword(text: string, keywords: string[]): boolean {
  if (!text || keywords.length === 0) {
    return false;
  }
  return keywords.some((keyword) => keyword && text.includes(keyword));
}

export function computeScreenResult(
  input: ScreenEmailInput,
  rules: ScreenRules = loadScreenRules(),
): ScreenResult {
  const domain = extractDomainFromAddress(input.fromAddress);
  const combinedText = `${input.subject}\n${input.bodyText}`;

  if (
    domain &&
    rules.blacklistDomains.some((item) => domainMatches(domain, item))
  ) {
    return 'IRRELEVANT';
  }

  if (containsAnyKeyword(combinedText, rules.excludeKeywords)) {
    return 'IRRELEVANT';
  }

  if (
    domain &&
    rules.whitelistDomains.some((item) => domainMatches(domain, item))
  ) {
    return 'RELEVANT';
  }

  if (containsAnyKeyword(input.subject, rules.subjectKeywords)) {
    return 'RELEVANT';
  }

  if (containsAnyKeyword(input.bodyText, rules.bodyRelevantKeywords)) {
    return 'RELEVANT';
  }

  if (containsAnyKeyword(input.bodyText, rules.bodyKeywords)) {
    return 'SUSPECT';
  }

  return 'SUSPECT';
}

@Injectable()
export class ScreenService {
  constructor(@Inject(DATABASE) private readonly db: AppDatabase) {}

  async getStats(): Promise<MailScreenStats> {
    const rows = await this.db
      .select({
        screenResult: email.screenResult,
        count: sql<number>`count(*)`,
      })
      .from(email)
      .groupBy(email.screenResult);

    const stats: MailScreenStats = {
      total: 0,
      irrelevant: 0,
      suspect: 0,
      relevant: 0,
    };

    for (const row of rows) {
      const count = Number(row.count ?? 0);
      stats.total += count;
      switch (row.screenResult) {
        case 'IRRELEVANT':
          stats.irrelevant = count;
          break;
        case 'SUSPECT':
          stats.suspect = count;
          break;
        case 'RELEVANT':
          stats.relevant = count;
          break;
        default:
          stats.suspect += count;
          break;
      }
    }

    return stats;
  }

  async rescreenAll(): Promise<RescreenResult> {
    const rules = loadScreenRules();
    const rows = await this.db
      .select({
        id: email.id,
        fromAddress: email.fromAddress,
        subject: email.subject,
        bodyText: email.bodyText,
      })
      .from(email);

    let processed = 0;
    for (const row of rows) {
      const screenResult = computeScreenResult(
        {
          fromAddress: row.fromAddress,
          subject: row.subject,
          bodyText: row.bodyText,
        },
        rules,
      );

      await this.db
        .update(email)
        .set({ screenResult })
        .where(eq(email.id, row.id));
      processed += 1;
    }

    return {
      processed,
      stats: await this.getStats(),
    };
  }
}
