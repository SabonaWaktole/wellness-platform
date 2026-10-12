import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canGoBack,
  inLastGroupStep,
  currentStep,
  initialTourState,
  isLast,
  progress,
  tourReducer,
} from './tourMachine';
import type { MachineEvent, MachineState, StepRef } from './types';

const ref = (id: string, group?: string): StepRef => ({ id, group });
const STEPS: StepRef[] = [ref('a'), ref('b'), ref('c')];

const run = (events: MachineEvent[], from: MachineState = initialTourState): MachineState =>
  events.reduce(tourReducer, from);

const started = (steps = STEPS) => run([{ type: 'START', steps }]);

describe('SUP-03 tour machine: transitions', () => {
  it('SUP-03 starts idle', () => {
    expect(initialTourState).toEqual({ status: 'idle' });
  });

  it('SUP-03 START runs from the first step', () => {
    expect(started()).toMatchObject({ status: 'running', index: 0 });
    expect(currentStep(started())?.id).toBe('a');
  });

  it('SUP-03 START with no steps finishes at once', () => {
    expect(run([{ type: 'START', steps: [] }])).toMatchObject({ status: 'finished', outcome: 'completed' });
  });

  it('SUP-03 NEXT moves forward and BACK moves back', () => {
    const state = run([{ type: 'START', steps: STEPS }, { type: 'NEXT' }]);
    expect(currentStep(state)?.id).toBe('b');
    expect(currentStep(tourReducer(state, { type: 'BACK' }))?.id).toBe('a');
  });

  it('SUP-03 BACK on the first step is a no-op', () => {
    const state = started();
    expect(tourReducer(state, { type: 'BACK' })).toBe(state);
    expect(canGoBack(state)).toBe(false);
  });

  it('SUP-03 NEXT on the last step finishes as completed', () => {
    const state = run([{ type: 'START', steps: STEPS }, { type: 'NEXT' }, { type: 'NEXT' }]);
    expect(isLast(state)).toBe(true);
    expect(tourReducer(state, { type: 'NEXT' })).toMatchObject({
      status: 'finished',
      outcome: 'completed',
      lastStepId: 'c',
    });
  });

  it('SUP-03 SKIP_TOUR ends as skipped', () => {
    expect(run([{ type: 'START', steps: STEPS }, { type: 'NEXT' }, { type: 'SKIP_TOUR' }])).toMatchObject({
      status: 'finished',
      outcome: 'skipped',
      lastStepId: 'b',
    });
  });

  it('SUP-03 EXIT ends as exited and START resumes at the saved step', () => {
    const exited = run([{ type: 'START', steps: STEPS }, { type: 'NEXT' }, { type: 'EXIT' }]);
    expect(exited).toMatchObject({ status: 'finished', outcome: 'exited', lastStepId: 'b' });
    const resumed = tourReducer(exited, { type: 'START', steps: STEPS, resumeAtId: 'b' });
    expect(currentStep(resumed)?.id).toBe('b');
  });

  it('SUP-03 START resuming at an unknown step starts from the beginning', () => {
    expect(currentStep(run([{ type: 'START', steps: STEPS, resumeAtId: 'zzz' }]))?.id).toBe('a');
  });

  it('SUP-03 progress counts position inside the eligible list', () => {
    expect(progress(started())).toEqual({ index: 0, total: 3 });
    expect(progress(run([{ type: 'START', steps: STEPS }, { type: 'NEXT' }]))).toEqual({ index: 1, total: 3 });
    expect(progress(initialTourState)).toEqual({ index: 0, total: 0 });
  });

  it.each<[string, MachineEvent]>([
    ['NEXT', { type: 'NEXT' }],
    ['BACK', { type: 'BACK' }],
    ['SKIP_TOUR', { type: 'SKIP_TOUR' }],
    ['EXIT', { type: 'EXIT' }],
    ['STEPS_CHANGED', { type: 'STEPS_CHANGED', steps: STEPS }],
    ['TARGET_PENDING', { type: 'TARGET_PENDING' }],
    ['TARGET_READY', { type: 'TARGET_READY' }],
    ['TARGET_LOST', { type: 'TARGET_LOST' }],
    ['TARGET_RESTORED', { type: 'TARGET_RESTORED' }],
    ['HOLD_FOR_USER', { type: 'HOLD_FOR_USER', layerId: 'x' }],
    ['LAYER_OPENED', { type: 'LAYER_OPENED', group: 'g' }],
    ['LAYER_CLOSED', { type: 'LAYER_CLOSED' }],
  ])('SUP-03 %s is ignored while idle', (_name, event) => {
    expect(tourReducer(initialTourState, event)).toBe(initialTourState);
  });

  it('SUP-03 nothing but START leaves finished', () => {
    const finished = run([{ type: 'START', steps: STEPS }, { type: 'EXIT' }]);
    for (const event of [{ type: 'NEXT' }, { type: 'BACK' }, { type: 'TARGET_LOST' }, { type: 'EXIT' }] as MachineEvent[]) {
      expect(tourReducer(finished, event)).toBe(finished);
    }
  });
});

describe('SUP-06 SUP-08 tour machine: waiting and lost targets', () => {
  it('SUP-08 a pending target waits, and becoming ready resumes the same step', () => {
    const waiting = run([{ type: 'START', steps: STEPS }, { type: 'NEXT' }, { type: 'TARGET_PENDING' }]);
    expect(waiting).toMatchObject({ status: 'waiting', reason: 'loading', index: 1 });
    expect(tourReducer(waiting, { type: 'TARGET_READY' })).toMatchObject({ status: 'running', index: 1 });
  });

  it('SUP-08 a target that vanishes moves to lost, and returning restores it', () => {
    const lost = run([{ type: 'START', steps: STEPS }, { type: 'TARGET_LOST' }]);
    expect(lost).toMatchObject({ status: 'lost', index: 0 });
    expect(tourReducer(lost, { type: 'TARGET_RESTORED' })).toMatchObject({ status: 'running', index: 0 });
  });

  it('SUP-08 NEXT and BACK still work from a lost step, but not while waiting', () => {
    const lost = run([{ type: 'START', steps: STEPS }, { type: 'TARGET_LOST' }]);
    expect(currentStep(tourReducer(lost, { type: 'NEXT' }))?.id).toBe('b');
    const waiting = run([{ type: 'START', steps: STEPS }, { type: 'TARGET_PENDING' }]);
    expect(tourReducer(waiting, { type: 'NEXT' })).toBe(waiting);
  });

  it('SUP-08 SKIP_TOUR and EXIT work in every active state', () => {
    for (const middle of [[], [{ type: 'TARGET_LOST' }], [{ type: 'TARGET_PENDING' }]] as MachineEvent[][]) {
      const before = run([{ type: 'START', steps: STEPS }, ...middle]);
      expect(tourReducer(before, { type: 'EXIT' })).toMatchObject({ outcome: 'exited' });
      expect(tourReducer(before, { type: 'SKIP_TOUR' })).toMatchObject({ outcome: 'skipped' });
    }
  });

  it('SUP-08 TARGET_READY does not release a hold that waits for the user', () => {
    const held = run([{ type: 'START', steps: STEPS }, { type: 'HOLD_FOR_USER', layerId: 'dlg' }]);
    expect(tourReducer(held, { type: 'TARGET_READY' })).toBe(held);
  });
});

describe('SUP-08 tour machine: the step list changes under the tour', () => {
  const at = (id: string) => run([{ type: 'START', steps: STEPS, resumeAtId: id }]);

  it('SUP-08 removing an earlier step shifts the index and keeps the current step', () => {
    const next = tourReducer(at('c'), { type: 'STEPS_CHANGED', steps: [ref('b'), ref('c')] });
    expect(currentStep(next)?.id).toBe('c');
    expect(next).toMatchObject({ index: 1 });
  });

  it('SUP-08 adding a step before the current one keeps the current step', () => {
    const next = tourReducer(at('b'), { type: 'STEPS_CHANGED', steps: [ref('z'), ref('a'), ref('b'), ref('c')] });
    expect(currentStep(next)?.id).toBe('b');
    expect(next).toMatchObject({ index: 2 });
  });

  it('SUP-08 removing the current step re-anchors to the nearest following one', () => {
    const next = tourReducer(at('b'), { type: 'STEPS_CHANGED', steps: [ref('a'), ref('c')] });
    expect(currentStep(next)?.id).toBe('c');
  });

  it('SUP-08 removing the current and every later step re-anchors to the last one', () => {
    const next = tourReducer(at('c'), { type: 'STEPS_CHANGED', steps: [ref('a'), ref('b')] });
    expect(currentStep(next)?.id).toBe('b');
  });

  it('SUP-08 an unchanged list returns the same state object', () => {
    const state = at('b');
    expect(tourReducer(state, { type: 'STEPS_CHANGED', steps: [...STEPS] })).toBe(state);
  });

  it('SUP-08 an emptied list finishes the tour', () => {
    expect(tourReducer(at('b'), { type: 'STEPS_CHANGED', steps: [] })).toMatchObject({ status: 'finished' });
  });

  it('SUP-08 a lost step whose step disappears resumes running at the new anchor', () => {
    const lost = tourReducer(at('b'), { type: 'TARGET_LOST' });
    const next = tourReducer(lost, { type: 'STEPS_CHANGED', steps: [ref('a'), ref('c')] });
    expect(next).toMatchObject({ status: 'running' });
    expect(currentStep(next)?.id).toBe('c');
  });

  it('SUP-08 a lost step that stays keeps its status', () => {
    const lost = tourReducer(at('b'), { type: 'TARGET_LOST' });
    expect(tourReducer(lost, { type: 'STEPS_CHANGED', steps: [ref('b'), ref('c')] })).toMatchObject({
      status: 'lost',
      index: 0,
    });
  });
});

describe('SUP-10 tour machine: a step that opens a layer', () => {
  const steps: StepRef[] = [ref('open'), ref('f1', 'dialog'), ref('f2', 'dialog'), ref('after')];

  it('SUP-10 NEXT skips grouped steps unless the layer was opened', () => {
    const state = run([{ type: 'START', steps }, { type: 'NEXT' }]);
    expect(currentStep(state)?.id).toBe('after');
  });

  it('SUP-10 progress and isLast count only the top level steps outside the group', () => {
    expect(progress(run([{ type: 'START', steps }]))).toEqual({ index: 0, total: 2 });
  });

  it('SUP-10 HOLD_FOR_USER then LAYER_OPENED enters the group', () => {
    const held = run([{ type: 'START', steps }, { type: 'HOLD_FOR_USER', layerId: 'dlg' }]);
    expect(held).toMatchObject({ status: 'waiting', reason: 'user-action', index: 0 });
    const inside = tourReducer(held, { type: 'LAYER_OPENED', group: 'dialog' });
    expect(inside).toMatchObject({ status: 'running', parentId: 'open' });
    expect(currentStep(inside)?.id).toBe('f1');
    expect(progress(inside)).toEqual({ index: 0, total: 2 });
  });

  it('SUP-10 inside the group, NEXT moves within it and then leaves it past the group', () => {
    const inside = run([
      { type: 'START', steps },
      { type: 'HOLD_FOR_USER', layerId: 'dlg' },
      { type: 'LAYER_OPENED', group: 'dialog' },
      { type: 'NEXT' },
    ]);
    expect(currentStep(inside)?.id).toBe('f2');
    const out = tourReducer(inside, { type: 'NEXT' });
    expect(currentStep(out)?.id).toBe('after');
    expect(out).toMatchObject({ status: 'running', parentId: null });
  });

  it('SUP-10 BACK from the first grouped step returns to the parent', () => {
    const inside = run([
      { type: 'START', steps },
      { type: 'HOLD_FOR_USER', layerId: 'dlg' },
      { type: 'LAYER_OPENED', group: 'dialog' },
    ]);
    const back = tourReducer(inside, { type: 'BACK' });
    expect(currentStep(back)?.id).toBe('open');
    expect(back).toMatchObject({ parentId: null });
  });

  it('SUP-10 LAYER_CLOSED returns to the parent step', () => {
    const closed = run([
      { type: 'START', steps },
      { type: 'HOLD_FOR_USER', layerId: 'dlg' },
      { type: 'LAYER_OPENED', group: 'dialog' },
      { type: 'LAYER_CLOSED' },
    ]);
    expect(currentStep(closed)?.id).toBe('open');
    expect(closed).toMatchObject({ status: 'running', parentId: null });
    expect(currentStep(tourReducer(closed, { type: 'NEXT' }))?.id).toBe('after');
  });

  it('SUP-10 LAYER_OPENED for a group with no steps stays on the parent', () => {
    const held = run([{ type: 'START', steps }, { type: 'HOLD_FOR_USER', layerId: 'dlg' }]);
    expect(currentStep(tourReducer(held, { type: 'LAYER_OPENED', group: 'nope' }))?.id).toBe('open');
  });

  it('SUP-10 LAYER_CLOSED outside a group is ignored', () => {
    const state = started();
    expect(tourReducer(state, { type: 'LAYER_CLOSED' })).toBe(state);
  });
});

describe('SUP-03 tour machine: determinism and purity', () => {
  it('SUP-03 replaying a recorded sequence gives the same state', () => {
    const events: MachineEvent[] = [
      { type: 'START', steps: STEPS },
      { type: 'NEXT' },
      { type: 'TARGET_LOST' },
      { type: 'STEPS_CHANGED', steps: [ref('a'), ref('c')] },
      { type: 'TARGET_RESTORED' },
      { type: 'BACK' },
      { type: 'EXIT' },
    ];
    expect(run(events)).toEqual(run(events));
  });

  it('SUP-03 does not mutate the state it is given', () => {
    const state = started();
    const frozen = JSON.stringify(state);
    tourReducer(state, { type: 'NEXT' });
    tourReducer(state, { type: 'STEPS_CHANGED', steps: [ref('c')] });
    expect(JSON.stringify(state)).toBe(frozen);
  });

  it.each(['tourMachine.ts', 'types.ts'])('SUP-03 %s imports nothing from react, react-dom or react-router-dom', (file) => {
    const source = readFileSync(resolve(__dirname, file), 'utf8');
    expect(source).not.toMatch(/from\s+['"](react|react-dom|react-router-dom)(\/[^'"]*)?['"]/);
    expect(source).not.toMatch(/\b(document|window)\./);
  });
});

describe('SUP-10 tour machine: skipping a part and leaving a layer', () => {
  const steps: StepRef[] = [ref('open'), ref('f1', 'dialog'), ref('f2', 'dialog'), ref('after')];
  const holding = () => run([{ type: 'START', steps }, { type: 'HOLD_FOR_USER', layerId: 'dlg' }]);

  it('SUP-10 SKIP_GROUP leaves the wait for the user and goes past the whole group', () => {
    const next = tourReducer(holding(), { type: 'SKIP_GROUP' });
    expect(next).toMatchObject({ status: 'running', parentId: null });
    expect(currentStep(next)?.id).toBe('after');
  });

  it('SUP-10 SKIP_GROUP on the last step finishes the tour', () => {
    const only: StepRef[] = [ref('open'), ref('f1', 'dialog')];
    const held = run([{ type: 'START', steps: only }, { type: 'HOLD_FOR_USER', layerId: 'dlg' }]);
    expect(tourReducer(held, { type: 'SKIP_GROUP' })).toMatchObject({ status: 'finished', outcome: 'completed' });
  });

  it('SUP-10 SKIP_GROUP is ignored unless the tour waits for the user outside a layer', () => {
    const running = run([{ type: 'START', steps }]);
    expect(tourReducer(running, { type: 'SKIP_GROUP' })).toBe(running);
    const inside = run([{ type: 'START', steps }, { type: 'HOLD_FOR_USER', layerId: 'dlg' }, { type: 'LAYER_OPENED', group: 'dialog' }]);
    expect(tourReducer(inside, { type: 'SKIP_GROUP' })).toBe(inside);
    const loading = run([{ type: 'START', steps }, { type: 'TARGET_PENDING' }]);
    expect(tourReducer(loading, { type: 'SKIP_GROUP' })).toBe(loading);
  });

  it('SUP-10 inLastGroupStep is true only on the final step of a layer', () => {
    const inside = run([{ type: 'START', steps }, { type: 'HOLD_FOR_USER', layerId: 'dlg' }, { type: 'LAYER_OPENED', group: 'dialog' }]);
    expect(inLastGroupStep(inside)).toBe(false);
    expect(inLastGroupStep(tourReducer(inside, { type: 'NEXT' }))).toBe(true);
    expect(inLastGroupStep(run([{ type: 'START', steps }]))).toBe(false);
    expect(inLastGroupStep(initialTourState)).toBe(false);
  });

  it('SUP-10 holding at the end of a group and then closing the layer returns to the opener', () => {
    const atEnd = run([
      { type: 'START', steps },
      { type: 'HOLD_FOR_USER', layerId: 'dlg' },
      { type: 'LAYER_OPENED', group: 'dialog' },
      { type: 'NEXT' },
      { type: 'HOLD_FOR_USER', layerId: 'dlg' },
    ]);
    expect(atEnd).toMatchObject({ status: 'waiting', reason: 'user-action', parentId: 'open' });
    const closed = tourReducer(atEnd, { type: 'LAYER_CLOSED' });
    expect(currentStep(closed)?.id).toBe('open');
    expect(currentStep(tourReducer(closed, { type: 'NEXT' }))?.id).toBe('after');
  });
});

describe('SUP-04 tour machine: explaining a single control', () => {
  const single = () => run([{ type: 'START', steps: [ref('only')], single: true }]);

  it('SUP-04 runs the one step with no progress', () => {
    expect(currentStep(single())?.id).toBe('only');
    expect(progress(single())).toEqual({ index: 0, total: 0 });
  });

  it('SUP-04 has no Next or Back', () => {
    const state = single();
    expect(tourReducer(state, { type: 'NEXT' })).toBe(state);
    expect(tourReducer(state, { type: 'BACK' })).toBe(state);
    expect(canGoBack(state)).toBe(false);
  });

  it('SUP-04 can still be exited, and a lost control is reported like in a tour', () => {
    expect(tourReducer(single(), { type: 'EXIT' })).toMatchObject({ status: 'finished', outcome: 'exited' });
    expect(tourReducer(single(), { type: 'TARGET_LOST' })).toMatchObject({ status: 'lost' });
  });
});
