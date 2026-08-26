import { asc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../../db/database.provider';
import { company, companyAlias } from '../../db/schema';

export function normalizeCompanyName(name: string): string {
  let normalized = name.replace(/[\s\-－—_]+/g, '').toLowerCase();
  normalized = normalized.replace(/pdd$/i, '');
  normalized = normalized.replace(
    /(集团股份有限公司|股份有限公司|有限公司|集团公司|集团|公司)$/u,
    '',
  );
  return normalized;
}

export type AliasMatchResult = {
  companyId: string;
  canonicalName: string;
  matchedAlias?: string;
};

export async function matchCompanyByAlias(
  db: AppDatabase,
  rawName: string,
): Promise<AliasMatchResult | null> {
  const normalized = normalizeCompanyName(rawName);
  if (!normalized) {
    return null;
  }

  const companies = await db.select().from(company);
  for (const row of companies) {
    if (normalizeCompanyName(row.canonicalName) === normalized) {
      return {
        companyId: row.id,
        canonicalName: row.canonicalName,
      };
    }
  }

  const aliases = await db
    .select()
    .from(companyAlias)
    .orderBy(asc(companyAlias.alias));

  for (const aliasRow of aliases) {
    if (normalizeCompanyName(aliasRow.alias) === normalized) {
      const companyRows = await db
        .select()
        .from(company)
        .where(eq(company.id, aliasRow.companyId))
        .limit(1);
      const matchedCompany = companyRows[0];
      if (!matchedCompany) {
        continue;
      }
      return {
        companyId: matchedCompany.id,
        canonicalName: matchedCompany.canonicalName,
        matchedAlias: aliasRow.alias,
      };
    }
  }

  return null;
}
