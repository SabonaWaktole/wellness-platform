import { PrismaClient } from '@prisma/client';
import { LookupList } from '../domain/LookupList';
import { LookupRecord } from '../domain/LookupItem';

/**
 * The Prisma side of each list: which delegate holds it and which columns
 * beyond the shared ones (`id, nameSq, nameEn, order, active`) belong to it.
 * The one place a new list's table is wired in.
 */
const TABLES: Record<LookupList, { delegate: (prisma: PrismaClient) => any; columns: string[] }> = {
  [LookupList.RiskLevels]: { delegate: (prisma) => prisma.riskLevel, columns: ['level', 'description'] },
  [LookupList.BusinessTypes]: { delegate: (prisma) => prisma.businessType, columns: ['riskLevelId'] },
};

const SHARED_COLUMNS = ['id', 'nameSq', 'nameEn', 'order', 'active'];

export function lookupDelegate(prisma: PrismaClient, list: LookupList) {
  return TABLES[list].delegate(prisma);
}

/** The columns to select for `list`, and to write from a `LookupRecord`. */
export function lookupColumns(list: LookupList): string[] {
  return [...SHARED_COLUMNS, ...TABLES[list].columns];
}

export function selectFor(list: LookupList): Record<string, true> {
  return Object.fromEntries(lookupColumns(list).map((column) => [column, true]));
}

/** Only `list`'s own columns out of `item`, so nothing else reaches the table. */
export function rowFor(list: LookupList, item: LookupRecord): Record<string, unknown> {
  return Object.fromEntries(lookupColumns(list).map((column) => [column, item[column] ?? null]));
}
