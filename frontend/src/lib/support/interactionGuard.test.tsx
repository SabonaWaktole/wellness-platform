import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertStepSafety, effectiveSafety, installGuard, type GuardContext } from './interactionGuard';

const GUARDED = ['click', 'pointerdown', 'mousedown', 'touchstart', 'keydown', 'submit', 'dragstart'];

const handlers = { del: vi.fn(), save: vi.fn(), submit: vi.fn(), mouseDown: vi.fn(), tryIt: vi.fn(), tourNext: vi.fn(), touch: vi.fn(), keyDown: vi.fn() };

const Page = () => (
  <div>
    <button type="button" onClick={handlers.del} onMouseDown={handlers.mouseDown} onTouchStart={handlers.touch} onKeyDown={handlers.keyDown}>
      {'Delete'}
    </button>
    <form onSubmit={(e) => { e.preventDefault(); handlers.submit(); }}>
      <input aria-label="name" />
      <textarea aria-label="notes" />
      <select aria-label="kind"><option>{'a'}</option></select>
      <button type="submit" onClick={handlers.save}>{'Save'}</button>
    </form>
    <a href="#x" onClick={handlers.del}>{'A link'}</a>
    <div role="button" tabIndex={0} onClick={handlers.del}>{'Role button'}</div>
    <p data-testid="text">{'Plain text'}</p>
    <div draggable data-testid="drag">{'Drag me'}</div>
    <div data-tour="fx.try" data-testid="tryit"><button type="button" onClick={handlers.tryIt}>{'Try it'}</button></div>
    <div data-support-ui><button type="button" onClick={handlers.tourNext}>{'Tour next'}</button></div>
  </div>
);

const ctx = (over: Partial<GuardContext> = {}): GuardContext => ({
  allows: (target) =>
    !!target.closest('[data-support-ui]') || target === document.documentElement || target === document.body || !!target.closest('[data-testid="tryit"]'),
  onBlocked: vi.fn(),
  ...over,
});

let remove: (() => void) | null = null;
const guard = (c = ctx()) => {
  remove = installGuard(() => c);
  return c;
};

afterEach(() => {
  remove?.();
  remove = null;
  Object.values(handlers).forEach((h) => h.mockClear());
  vi.restoreAllMocks();
});

describe('SUP-12 interaction guard: pointer', () => {
  it('SUP-12 swallows a click on a control, so its handler never runs', () => {
    render(<Page />);
    guard();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('link', { name: 'A link' }));
    fireEvent.click(screen.getByText('Role button'));
    expect(handlers.del).not.toHaveBeenCalled();
    expect(handlers.save).not.toHaveBeenCalled();
  });

  it('SUP-12 swallows the press that precedes the click, so nothing takes focus or starts a drag', () => {
    render(<Page />);
    guard();
    const delete_ = screen.getByRole('button', { name: 'Delete' });
    expect(fireEvent.mouseDown(delete_)).toBe(false);
    expect(fireEvent.pointerDown(delete_)).toBe(false);
    expect(handlers.mouseDown).not.toHaveBeenCalled();
    expect(fireEvent.dragStart(screen.getByTestId('drag'))).toBe(false);
  });

  it('SUP-13 does not stop a touch from scrolling the page, but the app never sees it', () => {
    render(<Page />);
    guard();
    const delete_ = screen.getByRole('button', { name: 'Delete' });
    expect(fireEvent.touchStart(delete_)).toBe(true);
    expect(handlers.touch).not.toHaveBeenCalled();
  });

  it('SUP-12 lets the tour’s own controls through', () => {
    render(<Page />);
    guard();
    fireEvent.click(screen.getByRole('button', { name: 'Tour next' }));
    expect(handlers.tourNext).toHaveBeenCalledTimes(1);
  });

  it('SUP-12 lets through what the rules allow (the control of a try-it step)', () => {
    render(<Page />);
    guard();
    fireEvent.click(screen.getByRole('button', { name: 'Try it' }));
    expect(handlers.tryIt).toHaveBeenCalledTimes(1);
  });

  it('SUP-13 lets a press on the page itself through, so the page scrollbar keeps working', () => {
    render(<Page />);
    guard();
    expect(fireEvent.mouseDown(document.body)).toBe(true);
    expect(fireEvent.mouseDown(document.documentElement)).toBe(true);
  });

  it('SUP-12 reports what it blocked, once per event, with the kind of attempt', () => {
    render(<Page />);
    const c = guard();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(c.onBlocked).toHaveBeenCalledWith(screen.getByRole('button', { name: 'Delete' }), 'click');
  });
});

describe('SUP-12 interaction guard: keyboard', () => {
  it.each(['Enter', ' '])('SUP-12 swallows %j on a button, a link and a role=button', (key) => {
    render(<Page />);
    guard();
    for (const node of [screen.getByRole('button', { name: 'Delete' }), screen.getByRole('link', { name: 'A link' }), screen.getByText('Role button')]) {
      expect(fireEvent.keyDown(node, { key })).toBe(false);
    }
    expect(handlers.keyDown).not.toHaveBeenCalled();
  });

  it('SUP-13 leaves Tab alone, so the keyboard still moves through the page', () => {
    render(<Page />);
    guard();
    expect(fireEvent.keyDown(screen.getByRole('button', { name: 'Delete' }), { key: 'Tab' })).toBe(true);
  });

  it('SUP-13 leaves Escape and the arrow keys alone', () => {
    render(<Page />);
    guard();
    for (const key of ['Escape', 'ArrowDown', 'ArrowRight']) expect(fireEvent.keyDown(screen.getByRole('button', { name: 'Delete' }), { key })).toBe(true);
  });

  it('SUP-13 Space on the page itself still scrolls it', () => {
    render(<Page />);
    guard();
    expect(fireEvent.keyDown(document.body, { key: ' ' })).toBe(true);
    expect(fireEvent.keyDown(screen.getByTestId('text'), { key: ' ' })).toBe(true);
  });

  it('SUP-13 typing a space or Enter in a text field still works', () => {
    render(<Page />);
    guard();
    for (const label of ['name', 'notes']) {
      expect(fireEvent.keyDown(screen.getByLabelText(label), { key: ' ' })).toBe(true);
    }
    expect(fireEvent.keyDown(screen.getByLabelText('notes'), { key: 'Enter' })).toBe(true);
  });

  it('SUP-12 Enter and Space on the allowed controls are left alone', () => {
    render(<Page />);
    guard();
    expect(fireEvent.keyDown(screen.getByRole('button', { name: 'Tour next' }), { key: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(screen.getByRole('button', { name: 'Try it' }), { key: ' ' })).toBe(true);
  });
});

describe('SUP-12 interaction guard: forms', () => {
  it('SUP-12 a form cannot be submitted, however it is triggered', () => {
    render(<Page />);
    const c = guard();
    const form = screen.getByLabelText('name').closest('form')!;
    fireEvent.submit(form);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(handlers.submit).not.toHaveBeenCalled();
    expect(c.onBlocked).toHaveBeenCalledWith(form, 'submit');
  });

  it('SUP-12 not even from a field the tour lets the user type in', () => {
    render(<Page />);
    guard();
    fireEvent.keyDown(screen.getByLabelText('name'), { key: 'Enter' });
    fireEvent.submit(screen.getByLabelText('name').closest('form')!);
    expect(handlers.submit).not.toHaveBeenCalled();
  });
});

describe('SUP-12 interaction guard: lifetime', () => {
  it('SUP-12 the same controls work again once the guard is removed', () => {
    render(<Page />);
    const stop = installGuard(() => ctx());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(handlers.del).not.toHaveBeenCalled();
    stop();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.submit(screen.getByLabelText('name').closest('form')!);
    expect(handlers.del).toHaveBeenCalledTimes(1);
    expect(handlers.submit).toHaveBeenCalledTimes(1);
  });

  it('SUP-12 removing it twice is safe', () => {
    const stop = installGuard(() => ctx());
    stop();
    expect(() => stop()).not.toThrow();
  });

  it('SUP-19 adds and removes exactly the same listeners', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    installGuard(() => ctx())();
    const count = (spy: typeof add) => spy.mock.calls.filter(([type]) => GUARDED.includes(type as string)).length;
    expect(count(add)).toBeGreaterThanOrEqual(GUARDED.length);
    expect(count(removeSpy)).toBe(count(add));
  });

  it('SUP-12 asks for the rules afresh on every event, so a step change changes what is allowed', () => {
    render(<Page />);
    let allow = false;
    guard(ctx({ allows: () => allow }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    allow = true;
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(handlers.del).toHaveBeenCalledTimes(1);
  });
});

describe('SUP-12 step safety', () => {
  it('SUP-12 a step that needs care is treated as explain-only whatever it declares', () => {
    expect(effectiveSafety({ id: 'd', target: 'a.b', kind: 'control', warning: true, safety: 'try-it' })).toBe('explain-only');
    expect(effectiveSafety({ id: 'd', target: 'a.b', kind: 'field', safety: 'try-it' })).toBe('try-it');
    expect(effectiveSafety({ id: 'd', target: 'a.b', kind: 'control' })).toBe('explain-only');
  });

  it('SUP-12 in development a destructive step that reaches run time as try-it is an error', () => {
    expect(() => assertStepSafety({ id: 'delete', target: 'a.b', kind: 'menu', warning: true, safety: 'try-it' })).toThrow(/delete.*try-it/);
    expect(() => assertStepSafety({ id: 'ok', target: 'a.b', kind: 'field', safety: 'try-it' })).not.toThrow();
    expect(() => assertStepSafety({ id: 'ok', target: 'a.b', kind: 'control', warning: true })).not.toThrow();
  });
});

describe('SUP-12 the support code never operates the page', () => {
  const root = resolve(__dirname);
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  const sources = walk(root).filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\./.test(file));

  it.each([
    ['.click(', /\.click\(/],
    ['.submit(', /\.submit\(/],
    ['dispatchEvent(', /dispatchEvent\(/],
    ['requestSubmit(', /requestSubmit\(/],
  ])('SUP-12 %s does not appear under lib/support', (_name, pattern) => {
    const offenders = sources.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('SUP-12 there are sources to check (the grep is not vacuous)', () => {
    expect(sources.length).toBeGreaterThan(20);
  });
});
