import type { MachineEvent, MachineState, StepRef } from './types';

/**
 * The tour's state machine: one pure reducer that owns every transition.
 *
 * It knows step ids and groups, never elements, copy or the DOM, so the
 * Next/Back/Skip/Exit/finish rules, the shrinking-step-list rule and the
 * waiting and lost states can all be proven with plain tables of events.
 *
 * Steps with a `group` explain a layer (dialog, menu) opened by another step.
 * Next and Back skip them; they are reachable only through LAYER_OPENED, and
 * LAYER_CLOSED returns to the step that opened the layer.
 */

export const initialTourState: MachineState = { status: 'idle' };

type ActiveState = Extract<MachineState, { status: 'running' | 'waiting' | 'lost' }>;

const isActive = (state: MachineState): state is ActiveState =>
  state.status === 'running' || state.status === 'waiting' || state.status === 'lost';

const isTop = (step: StepRef) => !step.group;

/** Whether `step` can be reached from where the tour currently is: top level, or inside group `group`. */
const reachableIn = (inGroup: string | null) => (step: StepRef) => (inGroup === null ? isTop(step) : step.group === inGroup);

const currentGroup = (state: ActiveState) => (state.parentId === null ? null : (state.steps[state.index]?.group ?? null));

const finish = (state: ActiveState, outcome: 'completed' | 'skipped' | 'exited'): MachineState => ({
  status: 'finished',
  outcome,
  // The resume point is always a top-level step, so inside a layer it is the step that opened it.
  lastStepId: state.parentId ?? state.steps[state.index]?.id ?? null,
});

const running = (state: ActiveState, index: number, parentId: string | null): MachineState => ({
  status: 'running',
  steps: state.steps,
  index,
  parentId,
});

const findFrom = (steps: StepRef[], from: number, step: number, test: (s: StepRef) => boolean): number => {
  for (let i = from + step; i >= 0 && i < steps.length; i += step) if (test(steps[i])) return i;
  return -1;
};

/** The index NEXT would go to, and the parent it would be under; null when NEXT finishes the tour. */
const nextTarget = (state: ActiveState): { index: number; parentId: string | null } | null => {
  const inGroup = currentGroup(state);
  const within = findFrom(state.steps, state.index, 1, reachableIn(inGroup));
  if (within >= 0) return { index: within, parentId: state.parentId };
  if (inGroup === null) return null;
  const after = findFrom(state.steps, state.index, 1, isTop);
  return after >= 0 ? { index: after, parentId: null } : null;
};

const backTarget = (state: ActiveState): { index: number; parentId: string | null } | null => {
  const inGroup = currentGroup(state);
  const within = findFrom(state.steps, state.index, -1, reachableIn(inGroup));
  if (within >= 0) return { index: within, parentId: state.parentId };
  if (inGroup === null) return null;
  const parent = state.steps.findIndex((s) => s.id === state.parentId);
  return parent >= 0 ? { index: parent, parentId: null } : null;
};

const sameSteps = (a: StepRef[], b: StepRef[]) =>
  a.length === b.length && a.every((step, i) => step.id === b[i].id && step.group === b[i].group);

const stepsChanged = (state: ActiveState, next: StepRef[]): MachineState => {
  if (sameSteps(state.steps, next)) return state;
  const current = state.steps[state.index];
  const parentId = state.parentId !== null && next.some((s) => s.id === state.parentId) ? state.parentId : null;
  const inGroup = parentId === null ? null : (current?.group ?? null);
  const ok = reachableIn(inGroup);

  const stay = next.findIndex((s) => s.id === current?.id);
  if (stay >= 0 && ok(next[stay])) return { ...state, steps: next, index: stay, parentId };

  // The current step is gone (or no longer reachable): the nearest following step that still exists,
  // otherwise the last reachable one, and the tour carries on from there.
  let anchor = -1;
  for (let k = state.index + 1; k < state.steps.length && anchor < 0; k += 1) {
    const j = next.findIndex((s) => s.id === state.steps[k].id);
    if (j >= 0 && ok(next[j])) anchor = j;
  }
  if (anchor < 0) anchor = findFrom(next, next.length, -1, ok);
  if (anchor >= 0) return { status: 'running', steps: next, index: anchor, parentId };

  const top = findFrom(next, next.length, -1, isTop);
  if (top >= 0) return { status: 'running', steps: next, index: top, parentId: null };
  return { status: 'finished', outcome: 'completed', lastStepId: state.parentId ?? current?.id ?? null };
};

export function tourReducer(state: MachineState, event: MachineEvent): MachineState {
  if (event.type === 'START') {
    const first = event.steps.findIndex(isTop);
    if (first < 0) return { status: 'finished', outcome: 'completed', lastStepId: null };
    const resume = event.resumeAtId ? event.steps.findIndex((s) => s.id === event.resumeAtId && isTop(s)) : -1;
    return { status: 'running', steps: event.steps, index: resume >= 0 ? resume : first, parentId: null };
  }

  if (!isActive(state)) return state;

  switch (event.type) {
    case 'NEXT': {
      if (state.status === 'waiting') return state;
      const target = nextTarget(state);
      return target ? running(state, target.index, target.parentId) : finish(state, 'completed');
    }
    case 'BACK': {
      if (state.status === 'waiting') return state;
      const target = backTarget(state);
      return target ? running(state, target.index, target.parentId) : state;
    }
    case 'SKIP_TOUR':
      return finish(state, 'skipped');
    case 'EXIT':
      return finish(state, 'exited');
    case 'STEPS_CHANGED':
      return stepsChanged(state, event.steps);
    case 'TARGET_PENDING':
      return state.status === 'running' ? { ...state, status: 'waiting', reason: 'loading', layerId: null } : state;
    case 'TARGET_READY':
      return state.status === 'waiting' && state.reason === 'loading' ? running(state, state.index, state.parentId) : state;
    case 'TARGET_LOST':
      return state.status === 'running' || (state.status === 'waiting' && state.reason === 'loading')
        ? { status: 'lost', steps: state.steps, index: state.index, parentId: state.parentId }
        : state;
    case 'TARGET_RESTORED':
      return state.status === 'lost' ? running(state, state.index, state.parentId) : state;
    case 'HOLD_FOR_USER':
      return state.status === 'running'
        ? { ...state, status: 'waiting', reason: 'user-action', layerId: event.layerId }
        : state;
    case 'LAYER_OPENED': {
      if (state.status !== 'waiting' || state.reason !== 'user-action') return state;
      const inside = findFrom(state.steps, state.index, 1, (s) => s.group === event.group);
      return inside >= 0
        ? running(state, inside, state.steps[state.index].id)
        : running(state, state.index, state.parentId);
    }
    case 'LAYER_CLOSED': {
      if (state.parentId === null) return state;
      const parent = state.steps.findIndex((s) => s.id === state.parentId);
      return parent >= 0 ? running(state, parent, null) : state;
    }
    default:
      return state;
  }
}

export const currentStep = (state: MachineState): StepRef | null => (isActive(state) ? (state.steps[state.index] ?? null) : null);

/** Position among the steps reachable right now (the eligible top level, or the open layer's group). */
export const progress = (state: MachineState): { index: number; total: number } => {
  if (!isActive(state)) return { index: 0, total: 0 };
  const visible = state.steps.filter(reachableIn(currentGroup(state)));
  return { index: Math.max(0, visible.findIndex((s) => s.id === state.steps[state.index]?.id)), total: visible.length };
};

export const isLast = (state: MachineState): boolean => isActive(state) && nextTarget(state) === null;

export const canGoBack = (state: MachineState): boolean => isActive(state) && backTarget(state) !== null;
