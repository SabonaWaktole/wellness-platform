import { resolveStepCopy, runtimeVars, type Translate } from './defineGuide';
import { shellSteps } from './guides/shell';
import { isSharedKind } from './sharedGuidance';
import type { PageGuide, StepCopy } from './types';

export interface PickCopy {
  copy: StepCopy;
  /** Nobody has written anything for this control. */
  fallback: boolean;
}

/** The tour ids an element carries (`data-tour` is a space separated list). */
export const tourTokens = (element: Element): string[] => (element.getAttribute('data-tour') ?? '').split(/\s+/).filter(Boolean);

/**
 * What to say about a control the user pointed at, in order of trust: the page
 * guide's own step for it; the shell guide's (the header and menu, on every
 * page); the shared guidance for the kind of control it says it is; and
 * otherwise a plain admission that nothing is written. Text is never invented.
 */
export function resolvePickCopy(element: Element, guide: PageGuide | null, t: Translate): PickCopy {
  const runtime = runtimeVars(element);
  const tokens = tourTokens(element);

  for (const token of tokens) {
    const step = guide?.steps.find((s) => s.target === token);
    if (guide && step) {
      const copy = resolveStepCopy(guide, step, t, runtime);
      if (copy.title) return { copy, fallback: false };
    }
    const shell = shellSteps.find((s) => s.target === token);
    if (shell) {
      const copy = resolveStepCopy({ pageId: 'shell', namespace: 'support' }, shell, t, runtime);
      if (copy.title) return { copy, fallback: false };
    }
  }

  const kind = element.getAttribute('data-tour-kind');
  if (kind && isSharedKind(kind)) {
    const copy = resolveStepCopy({ pageId: 'pick', namespace: 'support' }, { id: 'picked', target: tokens[0] ?? '', kind: 'control', use: `shared.${kind}` }, t, runtime);
    if (copy.title) return { copy, fallback: false };
  }

  return { copy: { title: t('pick.noHelpTitle', { ns: 'support' }), body: t('pick.noHelpBody', { ns: 'support' }) }, fallback: true };
}

/** A short name for the control, for a screen reader to announce: what is written for it, else what it says on itself, else its id. */
export function candidateName(element: Element, guide: PageGuide | null, t: Translate): string {
  const { copy, fallback } = resolvePickCopy(element, guide, t);
  if (!fallback) return copy.title;
  const label = element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '';
  return (label.length > 60 ? `${label.slice(0, 60)}…` : label) || (tourTokens(element)[0] ?? '');
}
