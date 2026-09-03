import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHistory, HISTORY_LIMIT } from './useHistory';
import { emptyPageGeometry, type FormDocument } from '../../../types/form';

const doc = (marker: string): FormDocument => ({
  version: 3,
  page: emptyPageGeometry(),
  pages: [{ id: 'p1', sections: [{ id: marker, title: marker, x: 48, y: 48, width: 300, height: 100, elements: [] }] }],
});

describe('useHistory', () => {
  it('starts with nothing to undo or redo', () => {
    const { result } = renderHook(() => useHistory(doc('a')));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.present.pages[0].sections[0].id).toBe('a');
  });

  it('undoes and redoes a single commit', () => {
    const { result } = renderHook(() => useHistory(doc('a')));

    act(() => result.current.commit(doc('b')));
    expect(result.current.present.pages[0].sections[0].id).toBe('b');
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.present.pages[0].sections[0].id).toBe('a');
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.present.pages[0].sections[0].id).toBe('b');
  });

  /*
   * THE REQUIREMENT THAT SHAPES THIS HOOK (spec §21, §35).
   *
   * A continuous drag fires a state change per pointermove — dozens or
   * hundreds. Without coalescing, one drag becomes one Ctrl+Z per pixel
   * moved, which makes undo useless precisely when it matters most.
   */
  it('coalesces a continuous drag into ONE undo entry', () => {
    const { result } = renderHook(() => useHistory(doc('start')));

    act(() => {
      result.current.beginInteraction();
      for (let i = 0; i < 40; i += 1) result.current.commit(doc(`move-${i}`));
      result.current.endInteraction();
    });

    expect(result.current.present.pages[0].sections[0].id).toBe('move-39');

    act(() => result.current.undo());
    // One undo returns to before the whole drag, not to move-38.
    expect(result.current.present.pages[0].sections[0].id).toBe('start');
    expect(result.current.canUndo).toBe(false);
  });

  it('keeps separate drags as separate entries', () => {
    const { result } = renderHook(() => useHistory(doc('start')));

    act(() => {
      result.current.beginInteraction();
      result.current.commit(doc('drag1-a'));
      result.current.commit(doc('drag1-b'));
      result.current.endInteraction();
    });
    act(() => {
      result.current.beginInteraction();
      result.current.commit(doc('drag2-a'));
      result.current.endInteraction();
    });

    act(() => result.current.undo());
    expect(result.current.present.pages[0].sections[0].id).toBe('drag1-b');
    act(() => result.current.undo());
    expect(result.current.present.pages[0].sections[0].id).toBe('start');
  });

  it('drops the redo branch once a new edit is committed', () => {
    const { result } = renderHook(() => useHistory(doc('a')));

    act(() => result.current.commit(doc('b')));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.commit(doc('c')));
    expect(result.current.canRedo).toBe(false);
    expect(result.current.present.pages[0].sections[0].id).toBe('c');
  });

  it('caps the stack so a long session cannot grow without bound', () => {
    const { result } = renderHook(() => useHistory(doc('base')));

    act(() => {
      for (let i = 0; i < HISTORY_LIMIT + 25; i += 1) result.current.commit(doc(`s${i}`));
    });

    act(() => {
      for (let i = 0; i < HISTORY_LIMIT + 50; i += 1) result.current.undo();
    });

    // The oldest states fell off the bottom; 'base' is no longer reachable.
    expect(result.current.present.pages[0].sections[0].id).not.toBe('base');
    expect(result.current.canUndo).toBe(false);
  });

  it('ignores a commit identical to the present state', () => {
    const { result } = renderHook(() => useHistory(doc('a')));
    const same = result.current.present;

    act(() => result.current.commit(same));
    expect(result.current.canUndo).toBe(false);
  });

  it('reset() replaces the document and clears history', () => {
    const { result } = renderHook(() => useHistory(doc('a')));

    act(() => result.current.commit(doc('b')));
    act(() => result.current.reset(doc('fresh')));

    expect(result.current.present.pages[0].sections[0].id).toBe('fresh');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  /*
   * Rung 3 of the overflow ladder relocates a section AND inserts a page in
   * one result. Because layoutOps returns a single document, one commit
   * carries both — so one Ctrl+Z must reverse both.
   */
  it('treats a relocation-plus-page-insert as one entry', () => {
    const before: FormDocument = {
      version: 3,
      page: emptyPageGeometry(),
      pages: [{ id: 'p1', sections: [] }],
    };
    const after: FormDocument = {
      version: 3,
      page: emptyPageGeometry(),
      pages: [{ id: 'p1', sections: [] }, { id: 'p2', sections: [] }],
    };

    const { result } = renderHook(() => useHistory(before));
    act(() => result.current.commit(after));
    expect(result.current.present.pages).toHaveLength(2);

    act(() => result.current.undo());
    expect(result.current.present.pages).toHaveLength(1);
  });
});
