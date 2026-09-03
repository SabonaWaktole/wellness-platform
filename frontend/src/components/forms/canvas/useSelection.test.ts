import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSelection } from './useSelection';

describe('useSelection', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useSelection());
    expect(result.current.selection).toEqual([]);
    expect(result.current.primary).toBeNull();
  });

  it('selects a single item, replacing whatever was selected', () => {
    const { result } = renderHook(() => useSelection());

    act(() => result.current.select({ type: 'element', id: 'a' }));
    act(() => result.current.select({ type: 'element', id: 'b' }));

    expect(result.current.selection).toHaveLength(1);
    expect(result.current.primary).toEqual({ type: 'element', id: 'b' });
  });

  it('adds to the selection with the additive modifier', () => {
    const { result } = renderHook(() => useSelection());

    act(() => result.current.select({ type: 'element', id: 'a' }));
    act(() => result.current.select({ type: 'element', id: 'b' }, { additive: true }));

    expect(result.current.ids).toEqual(['a', 'b']);
  });

  it('toggles an already-selected item back off when additive', () => {
    const { result } = renderHook(() => useSelection());

    act(() => result.current.select({ type: 'element', id: 'a' }));
    act(() => result.current.select({ type: 'element', id: 'b' }, { additive: true }));
    act(() => result.current.select({ type: 'element', id: 'a' }, { additive: true }));

    expect(result.current.ids).toEqual(['b']);
  });

  /*
   * A multi-selection of mixed kinds has no coherent meaning — "align a page
   * with an element" is not an operation — so adding a different kind
   * replaces rather than mixes.
   */
  it('replaces the selection when the added item is a different kind', () => {
    const { result } = renderHook(() => useSelection());

    act(() => result.current.select({ type: 'element', id: 'a' }));
    act(() => result.current.select({ type: 'section', id: 's1' }, { additive: true }));

    expect(result.current.selection).toEqual([{ type: 'section', id: 's1' }]);
  });

  it('reports whether a given id is selected', () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.select({ type: 'element', id: 'a' }));

    expect(result.current.isSelected('a')).toBe(true);
    expect(result.current.isSelected('z')).toBe(false);
  });

  it('selectMany replaces the whole selection at once (marquee)', () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.selectMany('element', ['a', 'b', 'c']));
    expect(result.current.ids).toEqual(['a', 'b', 'c']);
  });

  /* Spec §21: Escape exits the current editing/selection interaction. */
  it('clear() empties the selection', () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.select({ type: 'element', id: 'a' }));
    act(() => result.current.clear());
    expect(result.current.selection).toEqual([]);
  });

  it('drops ids that no longer exist in the document', () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.selectMany('element', ['a', 'b', 'c']));
    act(() => result.current.retain(new Set(['a', 'c'])));
    expect(result.current.ids).toEqual(['a', 'c']);
  });

  it('primary is the LAST item added, which is what the panel inspects', () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.selectMany('element', ['a', 'b']));
    act(() => result.current.select({ type: 'element', id: 'c' }, { additive: true }));
    expect(result.current.primary).toEqual({ type: 'element', id: 'c' });
  });
});
