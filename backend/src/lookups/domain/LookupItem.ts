import { InvalidLookupValueError } from './errors';

/**
 * What every value of every admin-managed list has: an Albanian label (the
 * workspace's language, so required), an optional English one, a display
 * order and an active flag. A deactivated value stays on the records that
 * already use it but is not offered for new ones.
 */
export type LookupItem = {
  id: string;
  nameSq: string;
  nameEn: string | null;
  order: number;
  active: boolean;
};

/** A value with its list-specific fields (a risk level's `level`, a business type's `riskLevelId`). */
export type LookupRecord = LookupItem & Record<string, unknown>;

export type RiskLevel = LookupItem & {
  level: number;
  description: string | null;
};

export type BusinessType = LookupItem & {
  riskLevelId: string;
};

export type Area = LookupItem;

export type City = LookupItem & {
  areaId: string;
};

export interface LookupLabels {
  nameSq: string;
  nameEn: string | null;
}

export const MAX_LABEL_LENGTH = 100;

/** Trims both labels. Albanian is required; a blank English label is stored as missing (FR-LNG-03). */
export function lookupLabels(input: { nameSq: string; nameEn?: string | null }): LookupLabels {
  const nameSq = input.nameSq.trim();
  const nameEn = input.nameEn?.trim() || null;
  if (!nameSq) {
    throw new InvalidLookupValueError('nameSq', 'The Albanian name is required.');
  }
  if (nameSq.length > MAX_LABEL_LENGTH || (nameEn?.length ?? 0) > MAX_LABEL_LENGTH) {
    throw new InvalidLookupValueError(nameSq.length > MAX_LABEL_LENGTH ? 'nameSq' : 'nameEn', 'The name is too long.');
  }
  return { nameSq, nameEn };
}

/** The label to show in `lang`, falling back to Albanian when the English one is missing (FR-LNG-03). */
export function lookupLabel(item: LookupLabels, lang: string): string {
  return lang === 'en' && item.nameEn ? item.nameEn : item.nameSq;
}

/**
 * Two values with the same name would be indistinguishable in a picker.
 * Compared case-insensitively across both languages; `exceptId` is the value
 * being edited, which may keep its own name.
 */
export function findNameClash(items: LookupItem[], labels: LookupLabels, exceptId?: string): LookupItem | undefined {
  const wanted = new Set([labels.nameSq, labels.nameEn].filter(Boolean).map((name) => name!.toLocaleLowerCase()));
  return items.find(
    (item) =>
      item.id !== exceptId &&
      [item.nameSq, item.nameEn].some((name) => name !== null && wanted.has(name.toLocaleLowerCase()))
  );
}

/** Values in display order: `order`, then Albanian name so ties are stable. */
export function sortLookupItems<T extends LookupItem>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order || a.nameSq.localeCompare(b.nameSq, 'sq'));
}

/** The `order` a new value gets: after every existing one. */
export function nextOrder(items: LookupItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.order), 0) + 1;
}
