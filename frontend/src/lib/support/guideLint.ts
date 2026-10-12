import { TOUR_ID_PATTERN } from './tourProps';
import { copyKeys } from './defineGuide';
import { isSharedKind, sharedCopyKeys } from './sharedGuidance';
import type { PageGuide, StepKind } from './types';

/**
 * Checks a guide against the rules every page guide must keep. Used by each
 * page slice's integrity test (ST-1) and by a development-only startup check;
 * never imported by production code, because it reads the whole copy.
 */

export type Language = 'en' | 'sq';
/** Whether a copy key exists in a language, as `<namespace>:<key>`. */
export type CopyLookup = (lng: Language, namespace: string, key: string) => boolean;

export type LintCode =
  | 'empty-guide'
  | 'duplicate-step-id'
  | 'invalid-target-id'
  | 'repeat-required'
  | 'destructive-try-it'
  | 'try-it-not-allowed'
  | 'unknown-shared-kind'
  | 'shell-id-reused'
  | 'missing-copy';

export interface LintIssue {
  code: LintCode;
  stepId: string | null;
  message: string;
}

/** What a user may be allowed to try: opening, switching and filtering, never committing. */
const TRYABLE: StepKind[] = ['tab', 'filter', 'field', 'menu', 'opener'];
const REPEATED_SUFFIX = /\.(row|card|item)$/;

const catalogues = import.meta.glob<Record<string, unknown>>('../../locales/*/support*.json', { eager: true, import: 'default' });

const defaultLookup: CopyLookup = (lng, namespace, key) => {
  const file = catalogues[`../../locales/${lng}/${namespace}.json`];
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], file);
  return typeof value === 'string' && value.length > 0;
};

export function lintGuide(guide: PageGuide, lookup: CopyLookup = defaultLookup): LintIssue[] {
  const issues: LintIssue[] = [];
  const add = (code: LintCode, stepId: string | null, message: string) => issues.push({ code, stepId, message });

  if (guide.steps.length === 0) add('empty-guide', null, 'Guide has no steps.');

  const seen = new Set<string>();
  for (const step of guide.steps) {
    const id = step.id;
    if (seen.has(id)) add('duplicate-step-id', id, `Step "${id}" is declared more than once.`);
    seen.add(id);

    if (!TOUR_ID_PATTERN.test(step.target)) add('invalid-target-id', id, `Step "${id}" targets "${step.target}", which is not a valid tour id.`);
    if (REPEATED_SUFFIX.test(step.target) && !step.repeat) {
      add('repeat-required', id, `Step "${id}" targets "${step.target}", which repeats; declare repeat: true.`);
    }
    if (step.target.startsWith('shell.') && guide.pageId !== 'shell') {
      add('shell-id-reused', id, `Step "${id}" targets "${step.target}", a shell id; include the shell guide instead.`);
    }

    if (step.safety === 'try-it') {
      if (step.warning) add('destructive-try-it', id, `Step "${id}" is flagged destructive (warning) and must be explain-only, not try-it.`);
      if (!TRYABLE.includes(step.kind)) {
        add('try-it-not-allowed', id, `Step "${id}" is try-it but its kind "${step.kind}" cannot be tried; allowed kinds: ${TRYABLE.join(', ')}.`);
      }
    }

    const sharedId = step.use?.startsWith('shared.') ? step.use.slice('shared.'.length) : null;
    const sharedOk = sharedId !== null && isSharedKind(sharedId);
    if (step.use && !sharedOk) add('unknown-shared-kind', id, `Step "${id}" uses "${step.use}", which is not a shared guidance kind.`);

    const own = copyKeys(guide.pageId, id);
    const shared = sharedOk ? sharedCopyKeys(sharedId) : null;
    const required: Array<['title' | 'body' | 'warning']> = [['title'], ['body'], ...(step.warning ? ([['warning']] as Array<['warning']>) : [])];
    for (const lng of ['en', 'sq'] as const) {
      for (const [part] of required) {
        const hasOwn = lookup(lng, guide.namespace, own[part]);
        const hasShared = part !== 'warning' && shared !== null && lookup(lng, 'support', shared[part]);
        if (!hasOwn && !hasShared) add('missing-copy', id, `Step "${id}" has no "${guide.namespace}:${own[part]}" in ${lng}.`);
      }
    }
  }
  return issues;
}

/** Throws, listing every problem, if the guide breaks a rule. Each page slice's test calls this on its guide. */
export function assertGuideIntegrity(guide: PageGuide, lookup?: CopyLookup): void {
  const issues = lintGuide(guide, lookup);
  if (issues.length > 0) {
    throw new Error(`Guide ${guide.pageId} is not sound:\n${issues.map((issue) => `${guide.pageId}: ${issue.message}`).join('\n')}`);
  }
}
