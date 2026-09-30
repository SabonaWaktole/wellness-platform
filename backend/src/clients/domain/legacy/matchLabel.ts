import { LookupItem } from '../../../lookups/domain/LookupItem';

/** Trim, lower-case, and strip diacritics, so "Tiranë" and "Tirane" compare equal. */
export function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Matches free text against a list of lookup values by Albanian or English
 * name, normalized (case- and diacritic-insensitive). Returns the match only
 * when exactly one active value matches — an ambiguous match is left to the
 * caller to report rather than guessed.
 */
export function matchLookupLabel<T extends LookupItem>(text: string, items: T[]): T | undefined {
  const wanted = normalizeLabel(text);
  const active = items.filter((item) => item.active);
  const matches = active.filter(
    (item) => normalizeLabel(item.nameSq) === wanted || (item.nameEn && normalizeLabel(item.nameEn) === wanted)
  );
  return matches.length === 1 ? matches[0] : undefined;
}
