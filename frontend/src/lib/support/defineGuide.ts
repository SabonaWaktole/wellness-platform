import { isSharedKind, SHARED, type SharedKindId } from './sharedGuidance';
import type { GuideStep, PageGuide, StepCopy } from './types';

/** The part of i18next's `t` this module needs, so tests and hooks can pass either. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** A guide, frozen: guides are data, and nothing should change one at run time. */
export function definePageGuide(config: { pageId: string; version: number; namespace: string; steps: GuideStep[] }): PageGuide {
  const steps = Object.freeze(config.steps.map((step) => Object.freeze({ ...step })));
  return Object.freeze({ pageId: config.pageId, version: config.version, namespace: config.namespace, steps: steps as GuideStep[] });
}

/** The copy keys of a step, by convention: `<pageId>.<stepId>.title|body|when|warning|disabled` in the guide's namespace. */
export const copyKeys = (pageId: string, stepId: string) => ({
  title: `${pageId}.${stepId}.title`,
  body: `${pageId}.${stepId}.body`,
  when: `${pageId}.${stepId}.when`,
  warning: `${pageId}.${stepId}.warning`,
  disabled: `${pageId}.${stepId}.disabled`,
});

/**
 * A step for a shared control kind in one line. Kind, safety and the shared
 * copy come from the registry; the page may override anything.
 */
export function sharedStep(kindId: string, target: string, overrides: Partial<GuideStep> = {}): GuideStep {
  if (!isSharedKind(kindId)) throw new Error(`Unknown shared guidance kind "${kindId}".`);
  const shared = SHARED[kindId as SharedKindId];
  return {
    id: kindId,
    target,
    kind: shared.kind,
    safety: shared.safety,
    ...('warning' in shared && shared.warning ? { warning: true } : {}),
    use: `shared.${kindId}`,
    ...overrides,
  };
}

/**
 * Values only the live page knows, offered to the copy: the visible title of the dialog a control sits in.
 * Read when the step is shown, so the text never goes stale as data changes.
 */
export function runtimeVars(element: Element | null): Record<string, string> {
  const dialog = element?.closest('[role="dialog"]');
  const labelledBy = dialog?.getAttribute('aria-labelledby');
  const title = labelledBy ? document.getElementById(labelledBy)?.textContent?.trim() : undefined;
  return title ? { dialogTitle: title } : {};
}

/**
 * A step's text. Its own keys win; a part it does not define comes from the
 * shared kind it uses. `{{subject}}` and any other variable are filled from
 * the step's `vars`, then from `runtime`.
 */
export function resolveStepCopy(
  guide: Pick<PageGuide, 'pageId' | 'namespace'>,
  step: GuideStep,
  t: Translate,
  runtime: Record<string, string> = {},
): StepCopy {
  const vars = { subject: t('shared.subject', { ns: 'support' }), ...step.vars, ...runtime };
  const keys = copyKeys(guide.pageId, step.id);
  const part = (name: keyof typeof keys, sharedName: string) =>
    t(keys[name], { ns: guide.namespace, defaultValue: '', ...vars }) ||
    (step.use ? t(`${step.use}.${sharedName}`, { ns: 'support', defaultValue: '', ...vars }) : '');

  return {
    title: part('title', 'title'),
    body: part('body', 'body'),
    when: part('when', 'when') || undefined,
    warning: t(keys.warning, { ns: guide.namespace, defaultValue: '', ...vars }) || undefined,
    disabled: part('disabled', 'disabled') || undefined,
  };
}
