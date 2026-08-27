import path from 'node:path';
import type { AppDatabase } from '../../db/database.provider';
import { matchCompanyByAlias } from '../extraction/alias-match';
import { splitCompany } from './company-splitter';

export function parseSourceFileBasename(sourceFile: string): string {
  return path.basename(sourceFile, path.extname(sourceFile)).trim();
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    results.push(trimmed);
  }
  return results;
}

export function buildCompanyNameCandidates(sourceFile: string): string[] {
  const basename = parseSourceFileBasename(sourceFile);
  if (!basename) {
    return [];
  }

  const split = splitCompany(basename);
  const firstSegment = basename.split(/[-－—_·]/)[0]?.trim() ?? '';
  const segmentSplit =
    firstSegment && firstSegment !== basename
      ? splitCompany(firstSegment)
      : null;

  return uniqueNonEmpty([
    split.canonicalName,
    split.alias,
    basename,
    firstSegment,
    segmentSplit?.canonicalName ?? '',
    segmentSplit?.alias ?? '',
  ]);
}

export async function resolveCompanyFromSourceFile(
  db: AppDatabase,
  sourceFile: string,
): Promise<{ companyId: string; canonicalName: string } | null> {
  for (const candidate of buildCompanyNameCandidates(sourceFile)) {
    const match = await matchCompanyByAlias(db, candidate);
    if (match) {
      return {
        companyId: match.companyId,
        canonicalName: match.canonicalName,
      };
    }
  }

  return null;
}
