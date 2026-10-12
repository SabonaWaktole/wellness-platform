import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToDom } from './domObserverHub';
import { isSupportUi } from './interactionGuard';
import { useEligibleSteps } from './stepEligibility';
import { resolveTarget } from './targetResolver';
import type { GuideStep, PageGuide, TargetStatus } from './types';

export interface ExplainableEntry {
  step: GuideStep;
  /** The heading it is listed under; empty for none. */
  section: string;
  /** Its target is on every row (or card), so one entry stands for all of them. */
  repeated: boolean;
  status: TargetStatus;
}

interface Result {
  entries: ExplainableEntry[];
  /** The page is still loading and has shown nothing to explain yet. */
  loading: boolean;
  /** Look at the page again now. */
  refresh: () => void;
}

const PRESENT: TargetStatus[] = ['found', 'disabled', 'offscreen'];
const BUSY = '[aria-busy="true"], [data-tour-busy]';

const sameEntries = (a: ExplainableEntry[], b: ExplainableEntry[]) =>
  a.length === b.length && a.every((e, i) => e.step === b[i].step && e.status === b[i].status && e.repeated === b[i].repeated && e.section === b[i].section);

/**
 * What the user can ask about on this page right now: the guide's steps whose
 * control is in the page and who may use it, one entry per control however
 * many rows repeat it. It follows the page as data arrives, filters create or
 * remove controls and tabs change.
 */
export function useExplainableControls(guide: PageGuide | null): Result {
  const eligible = useEligibleSteps(guide);
  // Depend on what the steps are, not on the identity of the arrays that hold them: a caller that builds its
  // guide inline would otherwise re-subscribe, and re-render, on every render.
  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;
  const key = guide ? `${guide.pageId}@${guide.version}:${eligible.map((step) => step.id).join('|')}` : null;
  const [state, setState] = useState<{ entries: ExplainableEntry[]; loading: boolean }>({ entries: [], loading: false });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (key === null) {
      setState((previous) => (previous.entries.length === 0 && !previous.loading ? previous : { entries: [], loading: false }));
      return;
    }

    const compute = () => {
      const seen = new Set<string>();
      const entries: ExplainableEntry[] = [];
      for (const step of eligibleRef.current) {
        if (seen.has(step.target)) continue;
        const found = resolveTarget({
          id: step.target,
          repeat: step.repeat,
          pick: step.pick,
          nth: step.nth,
          within: step.within,
          scope: step.opens ? (step.scope ?? 'page') : step.scope,
        });
        if (!PRESENT.includes(found.status)) continue;
        seen.add(step.target);
        entries.push({ step, section: step.section ?? '', repeated: Boolean(step.repeat) || found.count > 1, status: found.status });
      }
      // Support's own busy markers (the list says it is loading) are not the page's.
      const loading = entries.length === 0 && Array.from(document.querySelectorAll(BUSY)).some((node) => !isSupportUi(node));
      setState((previous) => (previous.loading === loading && sameEntries(previous.entries, entries) ? previous : { entries, loading }));
    };

    compute();
    return subscribeToDom(compute);
  }, [key, tick]);

  return { ...state, refresh };
}
