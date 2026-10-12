/**
 * Per-user tour progress, kept in `localStorage` (the theme store and the sales
 * script panel set the precedent for per-viewer conveniences). It is a
 * convenience, never the only copy of anything: every access is wrapped, so
 * private mode or blocked storage degrades to "no progress remembered".
 */

/** Same convention as `THEME_STORAGE_KEY` in `store/useThemeStore.ts`. */
export const PROGRESS_STORAGE_KEY = 'wellness-support-progress';

export interface PageProgress {
  /** The guide version this record was written for. */
  v: number;
  completedAt?: string;
  dismissedAt?: string;
  /** The resume point: the last top level step reached. */
  lastStepId?: string;
}

type UserProgress = Record<string, PageProgress>;
type AllProgress = Record<string, UserProgress>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown) => (typeof value === 'string' ? value : undefined);

const asRecord = (value: unknown): PageProgress | null => {
  if (!isObject(value) || typeof value.v !== 'number') return null;
  const record: PageProgress = { v: value.v };
  const completedAt = asString(value.completedAt);
  const dismissedAt = asString(value.dismissedAt);
  const lastStepId = asString(value.lastStepId);
  if (completedAt) record.completedAt = completedAt;
  if (dismissedAt) record.dismissedAt = dismissedAt;
  if (lastStepId) record.lastStepId = lastStepId;
  return record;
};

/** Everything stored, with anything that does not have the expected shape dropped. */
function readAll(): AllProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return {};
    const all: AllProgress = {};
    for (const [user, pages] of Object.entries(parsed)) {
      if (!isObject(pages)) continue;
      const kept: UserProgress = {};
      for (const [pageId, value] of Object.entries(pages)) {
        const record = asRecord(value);
        if (record) kept[pageId] = record;
      }
      all[user] = kept;
    }
    return all;
  } catch {
    return {};
  }
}

/** `userId:tenantSlug`, so two workspaces of one person (or an impersonated one) keep separate progress. */
export const progressUserKey = (user: { userId: string; tenantSlug?: string | null }): string =>
  `${user.userId}:${user.tenantSlug ?? ''}`;

export const readProgress = (userKey: string): UserProgress => readAll()[userKey] ?? {};

/** The record for a page, or null when none exists or it was written for a different guide version. */
export function readPageProgress(userKey: string, pageId: string, guideVersion: number): PageProgress | null {
  const record = readProgress(userKey)[pageId];
  return record && record.v === guideVersion ? record : null;
}

/** Replaces the page's record. Returns false when storage refused the write. */
export function writeProgress(userKey: string, pageId: string, record: PageProgress): boolean {
  const all = readAll();
  all[userKey] = { ...all[userKey], [pageId]: record };
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}
