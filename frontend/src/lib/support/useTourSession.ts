import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Namespace } from '../../i18n/config';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useAuthStore } from '../../store/useAuthStore';
import { useSupportStore } from '../../store/useSupportStore';
import type { PopoverVariant } from '../../components/support/TourPopover';
import { announce } from './announcer';
import { subscribeToDom } from './domObserverHub';
import { assertStepSafety, effectiveSafety, installGuard, isSupportUi, type GuardContext } from './interactionGuard';
import { findLayer, topLayer } from './layerStack';
import { resolveStepCopy, runtimeVars } from './defineGuide';
import { ensureOpen, isAdapterName, restoreAll } from './layoutAdapters';
import { loadGuide } from './pageRegistry';
import { progressUserKey, readPageProgress, writeProgress } from './progressStorage';
import { scrollTargetIntoView } from './scrollTargetIntoView';
import { loadSupportCopy } from './supportCopy';
import { useEligibleSteps } from './stepEligibility';
import { currentStep, inLastGroupStep, initialTourState, progress, tourReducer } from './tourMachine';
import { useLayerWatcher } from './useLayerWatcher';
import { targetSpecKey, useTargetElement } from './useTargetElement';
import { useSupportPage } from './useSupportPage';
import type { GuideStep, PageGuide, StepCopy, StepRef, TargetSpec, TargetStatus } from './types';

const toRef = (step: GuideStep): StepRef => ({ id: step.id, group: step.group });
const signature = (steps: StepRef[]) => steps.map((s) => `${s.id}:${s.group ?? ''}`).join('|');

export interface TourSession {
  /** What the card should show; null while the guide loads or after the tour ended. */
  variant: PopoverVariant | null;
  copy: StepCopy | null;
  index: number;
  total: number;
  status: TargetStatus | null;
  /** The element to highlight; null for every variant but a shown step. */
  targetElement: Element | null;
  stepKey: string | null;
  /** The tour waits for the user to open something; the page owns Escape and Tab. */
  waitingForUser: boolean;
  /** Escape belongs to the layer the user is in (or about to open), not to the tour. */
  escapeToApp: boolean;
  /** What a waiting card waits for. */
  waitingFor: 'loading' | 'open' | 'close';
  /** The last step of a layer's part says Continue. */
  lastLabel: 'finish' | 'continue';
  /** Set when the user closed a layer before its part was over. */
  note: 'again' | undefined;
  onSkipPart: () => void;
  /** Said under the body, once, after the user tried to use a control during the tour. */
  notice: string | undefined;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onExit: () => void;
  onFinish: () => void;
  onReplay: () => void;
  onClose: () => void;
  /** The mobile sheet's height, so scrolling keeps the target clear of it. */
  setSheetHeight: (height: number) => void;
}

/**
 * Runs one tour: loads the guide and its copy, feeds the state machine from the
 * live page (target status, eligible steps, the route) and turns its state into
 * what the card, the spotlight and the screen reader should say.
 *
 * Policy, in one place. A step is shown when its control is found or disabled;
 * scrolled to first when offscreen; waited for (at most 4 s, in the target
 * hook) when a busy region may still render it; skipped, with an announcement,
 * when it is not on the page; and marked lost when it vanishes mid-step, and
 * restored if the same control comes back. Leaving the page ends the tour and
 * keeps the resume point.
 */
export function useTourSession(): TourSession {
  const { t } = useTranslation();
  const pageId = useSupportStore((state) => state.context.pageId);
  const { pageId: routePageId } = useSupportPage();
  const user = useAuthStore((state) => state.user);
  const userKey = user ? progressUserKey(user) : 'anonymous';

  const [guide, setGuide] = useState<PageGuide | null>(null);
  const [machine, dispatch] = useReducer(tourReducer, initialTourState);
  const eligible = useEligibleSteps(guide);
  const machineRef = useRef(machine);
  machineRef.current = machine;
  /** The opener step whose layer the user closed early, so its card can offer the part again. */
  const [seeAgainFor, setSeeAgainFor] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<'use' | 'submit' | null>(null);
  const noticeShown = useRef(false);

  const sheetHeight = useRef(0);
  const setSheetHeight = useCallback((height: number) => {
    sheetHeight.current = height;
  }, []);
  const lastSignature = useRef('');
  const scrolledTo = useRef<Element | null>(null);
  /** Said together with the next step message, so a skip is not lost to the step announcement that follows it. */
  const notice = useRef('');
  const leftByRoute = useRef(false);

  // Load the guide and its copy once per session; a page with no guide ends the session quietly.
  useEffect(() => {
    if (!pageId) {
      useSupportStore.getState().endSession();
      return;
    }
    let cancelled = false;
    void (async () => {
      const loaded = await loadGuide(pageId).catch(() => null);
      if (!loaded) {
        if (!cancelled) useSupportStore.getState().endSession();
        return;
      }
      await Promise.all([loadSupportCopy('support'), loadSupportCopy(loaded.namespace as Namespace)]);
      // In development a broken guide is reported the moment it loads; the lint reads every catalogue, so it is not shipped.
      if (import.meta.env.DEV) {
        void import('./guideLint').then(({ lintGuide }) => {
          const issues = lintGuide(loaded);
          if (issues.length > 0) console.warn(`Support guide ${loaded.pageId} has problems:\n${issues.map((i) => i.message).join('\n')}`);
        });
      }
      if (!cancelled) setGuide(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  // Start once the guide is in, resuming where an earlier Exit left off.
  const start = useCallback(
    (resume: boolean) => {
      if (!guide) return;
      const steps = eligible.map(toRef);
      if (steps.length === 0) {
        useSupportStore.getState().endSession();
        return;
      }
      lastSignature.current = signature(steps);
      const saved = resume ? readPageProgress(userKey, guide.pageId, guide.version) : null;
      dispatch({ type: 'START', steps, resumeAtId: saved?.lastStepId });
    },
    [guide, eligible, userKey],
  );
  useEffect(() => {
    if (guide && machine.status === 'idle') start(true);
  }, [guide, machine.status, start]);

  // Permissions, workflow or viewport changed under the tour: re-enter the list.
  useEffect(() => {
    if (machine.status !== 'running' && machine.status !== 'waiting' && machine.status !== 'lost') return;
    const steps = eligible.map(toRef);
    const next = signature(steps);
    if (next === lastSignature.current) return;
    lastSignature.current = next;
    dispatch({ type: 'STEPS_CHANGED', steps });
  }, [eligible, machine.status]);

  const isDesktop = useIsDesktop();
  const ref = currentStep(machine);
  const step = ref ? (eligible.find((s) => s.id === ref.id) ?? null) : null;
  const active = machine.status === 'running' || machine.status === 'waiting' || machine.status === 'lost';
  const parentId = machine.status === 'idle' || machine.status === 'finished' ? null : machine.parentId;

  // An opener is looked for on the page, not in the layer it opens: once that layer is up, the layer is the
  // scope, and the opener would otherwise read as gone.
  const spec: TargetSpec | null =
    active && step
      ? { id: step.target, repeat: step.repeat, pick: step.pick, nth: step.nth, within: step.within, scope: step.opens ? (step.scope ?? 'page') : step.scope }
      : null;
  const target = useTargetElement(spec);
  const fresh = target.key === targetSpecKey(spec);

  const copy: StepCopy | null = guide && step ? resolveStepCopy(guide, step, t, runtimeVars(target.element)) : null;

  // A destructive step is explain-only whatever the guide says; in development the mistake is reported loudly.
  // (Logged rather than thrown: an error in an effect would unmount the whole application over a content mistake.)
  useEffect(() => {
    if (!step) return;
    try {
      assertStepSafety(step);
    } catch (error) {
      console.error(error);
    }
  }, [step]);

  // The layer the current step opens, or is inside: watched from the moment the tour waits for the user.
  const opener = machine.status === 'waiting' && machine.reason === 'user-action' && parentId === null ? step : parentId ? (eligible.find((s) => s.id === parentId) ?? null) : null;
  const watchId = active && opener?.opens ? opener.opens : null;
  const layerOpen = useLayerWatcher(watchId, {
    onOpen: () => {
      const m = machineRef.current;
      if (watchId && m.status === 'waiting' && m.reason === 'user-action' && m.parentId === null) dispatch({ type: 'LAYER_OPENED', group: watchId });
    },
    onClose: () => {
      const m = machineRef.current;
      if (m.status === 'idle' || m.status === 'finished' || m.parentId === null) return;
      // Closed after the last step of its part (or while the tour waited for exactly that): carry on after the opener.
      // Closed sooner: back to the opener, offering the part again.
      const done = m.status === 'waiting' || inLastGroupStep(m);
      const openerId = m.parentId;
      dispatch({ type: 'LAYER_CLOSED' });
      if (done) dispatch({ type: 'NEXT' });
      else setSeeAgainFor(openerId);
    },
  });
  const layerOpenRef = useRef(layerOpen);
  layerOpenRef.current = layerOpen;

  /** Next: inside a layer's last step, wait for the user to close it, so later steps are not looked for inside it. */
  const advance = () => {
    const m = machineRef.current;
    if (inLastGroupStep(m) && layerOpenRef.current && opener?.opens) dispatch({ type: 'HOLD_FOR_USER', layerId: opener.opens });
    else dispatch({ type: 'NEXT' });
  };

  const skipCurrent = (fromWaiting: boolean) => {
    notice.current = t('announce.skipped', { ns: 'support', title: copy?.title ?? '' });
    if (fromWaiting) dispatch({ type: 'TARGET_LOST' });
    advance();
  };

  const skipPart = () => {
    notice.current = t('announce.skipped', { ns: 'support', title: copy?.title ?? '' });
    dispatch({ type: 'SKIP_GROUP' });
  };

  // Step policy: what to do about where the control is right now.
  useEffect(() => {
    if (!step || !fresh) return;
    const present = target.status === 'found' || target.status === 'disabled' || target.status === 'offscreen';
    // Inside a layer that has just gone, its controls went with it: the watcher will say it closed (after its
    // exit grace), so they are not reported lost. Asked of the page itself, because the watcher holds the layer
    // as open through that grace.
    if (parentId !== null && watchId && (machine.status === 'running' || machine.status === 'lost') && (!layerOpen || !findLayer(document, watchId))) return;
    if (machine.status === 'running') {
      if (parentId === null && step.opens && target.status === 'disabled') skipPart();
      else if (parentId === null && step.opens && (target.status === 'found' || target.status === 'offscreen')) dispatch({ type: 'HOLD_FOR_USER', layerId: step.opens });
      else if (target.status === 'pending') dispatch({ type: 'TARGET_PENDING' });
      else if (target.status === 'missing') skipCurrent(false);
      else if (target.status === 'lost') dispatch({ type: 'TARGET_LOST' });
      else if (target.status === 'offscreen' && target.element && scrolledTo.current !== target.element) {
        scrolledTo.current = target.element;
        scrollTargetIntoView(target.element, { sheetHeight: sheetHeight.current });
      }
    } else if (machine.status === 'waiting' && machine.reason === 'user-action') {
      // Waiting for the user to open a layer: if the opener can no longer be used, the part is skipped.
      if (parentId === null && (target.status === 'disabled' || target.status === 'missing' || target.status === 'lost')) skipPart();
    } else if (machine.status === 'waiting' && machine.reason === 'loading') {
      if (present) dispatch({ type: 'TARGET_READY' });
      else if (target.status === 'missing') skipCurrent(true);
    } else if (machine.status === 'lost' && present) {
      dispatch({ type: 'TARGET_RESTORED' });
    }
    // `skipCurrent` and `copy` are derived from the values listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine.status, parentId, step?.id, fresh, target.status, target.element, layerOpen]);

  // The read-only guard: while a tour runs, only the tour's own controls, the control of a try-it step and the
  // layer the user was asked to open can be operated. Rules are read afresh on every event.
  const guard = useRef<GuardContext>({ allows: () => false, onBlocked: () => {} });
  const targetElement = target.element;
  const waitingOnUser = machine.status === 'waiting' && machine.reason === 'user-action';
  guard.current = {
    allows: (el) => {
      if (isSupportUi(el) || el === document.documentElement || el === document.body) return true;
      if (step && effectiveSafety(step) === 'try-it' && targetElement?.contains(el)) return true;
      return waitingOnUser && (topLayer(document)?.contains(el) ?? false);
    },
    onBlocked: (_el, kind) => {
      if (kind === 'drag' || kind === 'pointer' || noticeShown.current) return;
      noticeShown.current = true;
      const key = kind === 'submit' ? 'popover.blockedSubmit' : 'popover.blocked';
      setBlocked(kind === 'submit' ? 'submit' : 'use');
      announce(t(key, { ns: 'support' }));
    },
  };
  useEffect(() => {
    if (!active) return;
    return installGuard(() => guard.current);
  }, [active]);
  useEffect(() => setBlocked(null), [step?.id]);

  // A tab step waits for the tab to be selected, and moves on when it is.
  useEffect(() => {
    const element = target.element;
    if (machine.status !== 'running' || step?.advanceWhen !== 'selected' || !element || !fresh) return;
    if (element.getAttribute('aria-selected') === 'true') return;
    return subscribeToDom(() => {
      if (element.getAttribute('aria-selected') === 'true') dispatch({ type: 'NEXT' });
    });
  }, [machine.status, step?.id, step?.advanceWhen, target.element, fresh]);

  // A step about something that is off screen on a phone (the sidebar) opens it first and puts it back
  // when the step changes or the tour ends. On a desktop the control is always there, so nothing is opened.
  const needsView = active && step?.needs && isAdapterName(step.needs) ? step.needs : null;
  useEffect(() => {
    if (!needsView || isDesktop) return;
    ensureOpen(needsView);
    return () => restoreAll();
  }, [needsView, isDesktop, step?.id]);

  // Route change: the tour belongs to the page it started on.
  useEffect(() => {
    if (!active || routePageId === pageId) return;
    leftByRoute.current = true;
    notice.current = '';
    dispatch({ type: 'EXIT' });
  }, [active, routePageId, pageId]);

  const { index, total } = progress(machine);
  const running = machine.status === 'running';

  // Say where we are: on each step (with any skip notice in front), and again if the total changes.
  useEffect(() => {
    if (!running || !copy?.title) return;
    const message = t('announce.step', { ns: 'support', current: index + 1, total, title: copy.title });
    announce([notice.current, message].filter(Boolean).join(' '));
    notice.current = '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, step?.id, copy?.title, index, total]);

  // The tour ended: remember how, say so, and close it (a finished tour waits for its completion card to be closed).
  useEffect(() => {
    if (machine.status !== 'finished' || !guide) return;
    const now = new Date().toISOString();
    if (machine.outcome === 'completed') writeProgress(userKey, guide.pageId, { v: guide.version, completedAt: now });
    else if (machine.outcome === 'skipped') writeProgress(userKey, guide.pageId, { v: guide.version, dismissedAt: now });
    else writeProgress(userKey, guide.pageId, { v: guide.version, ...(machine.lastStepId ? { lastStepId: machine.lastStepId } : {}) });

    const closing = leftByRoute.current ? t('announce.movedPage', { ns: 'support' }) : t('announce.closed', { ns: 'support' });
    announce(machine.outcome === 'completed' ? [notice.current, t('announce.done', { ns: 'support' })].filter(Boolean).join(' ') : closing);
    notice.current = '';
    if (machine.outcome !== 'completed') useSupportStore.getState().endSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine]);

  // Signing out clears the store; the host unmounts this hook, so nothing else to do here.

  let variant: PopoverVariant | null = null;
  if (machine.status === 'running') variant = 'step';
  else if (machine.status === 'waiting') variant = 'waiting';
  else if (machine.status === 'lost') variant = 'lost';
  else if (machine.status === 'finished' && machine.outcome === 'completed') variant = 'completed';

  return {
    variant,
    copy,
    index,
    total,
    status: fresh ? target.status : null,
    targetElement: variant === 'step' && fresh ? target.element : null,
    stepKey: step?.id ?? variant,
    waitingForUser: machine.status === 'waiting' && machine.reason === 'user-action',
    escapeToApp: (machine.status === 'waiting' && machine.reason === 'user-action') || parentId !== null,
    waitingFor: machine.status === 'waiting' && machine.reason === 'user-action' ? (parentId !== null ? 'close' : 'open') : 'loading',
    lastLabel: inLastGroupStep(machine) ? 'continue' : 'finish',
    note: step && seeAgainFor === step.id ? 'again' : undefined,
    onSkipPart: skipPart,
    notice: blocked ? t(blocked === 'submit' ? 'popover.blockedSubmit' : 'popover.blocked', { ns: 'support' }) : undefined,
    onNext: advance,
    onBack: () => dispatch({ type: 'BACK' }),
    onSkip: () => dispatch({ type: 'SKIP_TOUR' }),
    onExit: () => dispatch({ type: 'EXIT' }),
    onFinish: advance,
    onReplay: () => start(false),
    onClose: () => useSupportStore.getState().endSession(),
    setSheetHeight,
  };
}
