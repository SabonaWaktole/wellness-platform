import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useTourFocus } from './useTourFocus';

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement = document.body) => {
  const node = document.createElement(tag);
  parent.append(node);
  created.push(node);
  return node;
};
const created: HTMLElement[] = [];

afterEach(() => created.splice(0).forEach((node) => node.remove()));

describe('SUP-13 useTourFocus', () => {
  it('SUP-13 focuses the popover heading when the tour starts', () => {
    const heading = make('h2');
    heading.tabIndex = -1;
    renderHook(() => useTourFocus(true, { current: heading }, 'a'));
    expect(document.activeElement).toBe(heading);
  });

  it('SUP-13 focuses the heading again on every step', () => {
    const heading = make('h2');
    heading.tabIndex = -1;
    const other = make('button');
    const { rerender } = renderHook(({ step }) => useTourFocus(true, { current: heading }, step), { initialProps: { step: 'a' } });
    other.focus();
    rerender({ step: 'b' });
    expect(document.activeElement).toBe(heading);
  });

  it('SUP-13 gives focus back to the element the user started from', () => {
    const launcher = make('button');
    const heading = make('h2');
    heading.tabIndex = -1;
    launcher.focus();
    const { rerender } = renderHook(({ active }) => useTourFocus(active, { current: heading }, 'a'), { initialProps: { active: true } });
    expect(document.activeElement).toBe(heading);
    rerender({ active: false });
    expect(document.activeElement).toBe(launcher);
  });

  it('SUP-13 falls back to main when that element is gone', () => {
    const main = make('main');
    const launcher = make('button');
    const heading = make('h2');
    heading.tabIndex = -1;
    launcher.focus();
    const { rerender } = renderHook(({ active }) => useTourFocus(active, { current: heading }, 'a'), { initialProps: { active: true } });
    launcher.remove();
    rerender({ active: false });
    expect(document.activeElement).toBe(main);
  });

  it('SUP-13 restores focus when the host unmounts mid tour', () => {
    const launcher = make('button');
    const heading = make('h2');
    heading.tabIndex = -1;
    launcher.focus();
    const { unmount } = renderHook(() => useTourFocus(true, { current: heading }, 'a'));
    unmount();
    expect(document.activeElement).toBe(launcher);
  });

  it('SUP-13 leaves focus alone while no tour runs', () => {
    const launcher = make('button');
    launcher.focus();
    renderHook(() => useTourFocus(false, { current: null }, null));
    expect(document.activeElement).toBe(launcher);
  });

  it('SUP-13 does not crash when the heading is not mounted yet', () => {
    expect(() => renderHook(() => useTourFocus(true, { current: null }, 'a'))).not.toThrow();
  });

  it('SUP-13 the fallback main is left as it was found (no tabindex residue)', () => {
    const main = make('main');
    const heading = make('h2');
    heading.tabIndex = -1;
    const { rerender } = renderHook(({ active }) => useTourFocus(active, { current: heading }, 'a'), { initialProps: { active: true } });
    rerender({ active: false });
    expect(document.activeElement).toBe(main);
    expect(main.hasAttribute('tabindex')).toBe(false);
  });
});
