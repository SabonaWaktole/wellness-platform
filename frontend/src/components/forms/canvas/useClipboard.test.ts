import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClipboard } from './useClipboard';
import { emptyPageGeometry, type FormDocument, type FormElement } from '../../../types/form';

const el = (over: Partial<FormElement> = {}): FormElement => ({
  id: 'e1',
  type: 'INPUT',
  x: 10,
  y: 20,
  width: 200,
  height: 50,
  styles: { textColor: '#16a34a' },
  field: { key: 'company_name', label: 'Company Name', dataType: 'TEXT', required: true },
  ...over,
});

const doc = (elements: FormElement[]): FormDocument => ({
  version: 3,
  page: emptyPageGeometry(),
  pages: [
    { id: 'p1', sections: [{ id: 's1', title: 'S', x: 48, y: 48, width: 400, height: 300, elements }] },
  ],
});

const elementsOf = (d: FormDocument) => d.pages.flatMap((p) => p.sections).flatMap((s) => s.elements);
const sectionsOf = (d: FormDocument) => d.pages.flatMap((p) => p.sections);

describe('useClipboard', () => {
  it('copies then pastes a duplicate into the same section', () => {
    const d = doc([el()]);
    const { result } = renderHook(() => useClipboard());

    act(() => result.current.copy(d, ['e1']));
    let next: FormDocument = d;
    act(() => { next = result.current.paste(d, 's1').document; });

    expect(elementsOf(next)).toHaveLength(2);
  });

  /* Spec §20: a duplicate keeps content, styling and dimensions. */
  it('preserves styling, size and field configuration', () => {
    const d = doc([el()]);
    const { result } = renderHook(() => useClipboard());

    act(() => result.current.copy(d, ['e1']));
    let next: FormDocument = d;
    act(() => { next = result.current.paste(d, 's1').document; });

    const copy = elementsOf(next).find((e) => e.id !== 'e1')!;
    expect(copy.styles?.textColor).toBe('#16a34a');
    expect(copy.width).toBe(200);
    expect(copy.height).toBe(50);
    expect(copy.field!.label).toBe('Company Name');
    expect(copy.field!.required).toBe(true);
    expect(copy.type).toBe('INPUT');
  });

  /*
   * Spec §11/§20, and the sharpest rule in the clipboard: a duplicate is a
   * NEW field. Two components sharing one key is silent data loss — both
   * render, both get filled, and whichever serialises last wins.
   */
  it('mints a new id AND a new field key for the duplicate', () => {
    const d = doc([el()]);
    const { result } = renderHook(() => useClipboard());

    act(() => result.current.copy(d, ['e1']));
    let next: FormDocument = d;
    act(() => { next = result.current.paste(d, 's1').document; });

    const copy = elementsOf(next).find((e) => e.id !== 'e1')!;
    expect(copy.id).not.toBe('e1');
    expect(copy.field!.key).not.toBe('company_name');
    expect(new Set(elementsOf(next).map((e) => e.field!.key)).size).toBe(2);
  });

  it('offsets the paste so it does not land exactly on the original', () => {
    const d = doc([el()]);
    const { result } = renderHook(() => useClipboard());

    act(() => result.current.copy(d, ['e1']));
    let next: FormDocument = d;
    act(() => { next = result.current.paste(d, 's1').document; });

    const copy = elementsOf(next).find((e) => e.id !== 'e1')!;
    expect(copy.x !== 10 || copy.y !== 20).toBe(true);
  });

  /* Spec §20: multi-selection paste preserves RELATIVE positioning. */
  it('preserves relative positions when pasting several elements', () => {
    const d = doc([el({ id: 'a', x: 10, y: 10, field: { key: 'a', label: 'A', dataType: 'TEXT', required: false } }),
                   el({ id: 'b', x: 60, y: 90, field: { key: 'b', label: 'B', dataType: 'TEXT', required: false } })]);
    const { result } = renderHook(() => useClipboard());

    act(() => result.current.copy(d, ['a', 'b']));
    let next: FormDocument = d;
    act(() => { next = result.current.paste(d, 's1').document; });

    const copies = elementsOf(next).filter((e) => !['a', 'b'].includes(e.id));
    expect(copies).toHaveLength(2);
    const [c1, c2] = copies.sort((p, q) => p.y - q.y);
    expect(c2.x - c1.x).toBe(50);
    expect(c2.y - c1.y).toBe(80);
  });

  it('cut removes the originals and still pastes them back', () => {
    const d = doc([el()]);
    const { result } = renderHook(() => useClipboard());

    let afterCut: FormDocument = d;
    act(() => { afterCut = result.current.cut(d, ['e1']).document; });
    expect(elementsOf(afterCut)).toHaveLength(0);

    let pasted: FormDocument = afterCut;
    act(() => { pasted = result.current.paste(afterCut, 's1').document; });
    expect(elementsOf(pasted)).toHaveLength(1);
  });

  it('pasting with an empty clipboard is a no-op', () => {
    const d = doc([el()]);
    const { result } = renderHook(() => useClipboard());

    let next: FormDocument = d;
    act(() => { next = result.current.paste(d, 's1').document; });
    expect(next).toBe(d);
    expect(result.current.hasContent).toBe(false);
  });

  it('duplicate copies and pastes in one step, leaving the clipboard alone', () => {
    const d = doc([el({ id: 'x', field: { key: 'x', label: 'X', dataType: 'TEXT', required: false } })]);
    const { result } = renderHook(() => useClipboard());

    act(() => result.current.copy(d, ['x']));
    let next: FormDocument = d;
    act(() => { next = result.current.duplicate(d, ['x']).document; });

    expect(elementsOf(next)).toHaveLength(2);
    expect(result.current.hasContent).toBe(true);
  });
});


/*
 * SECTIONS COPY TOO.
 *
 * The clipboard handled elements only, so Ctrl+C on a section did nothing at
 * all while Ctrl+C on a field worked — the sort of inconsistency that makes a
 * user stop trusting a shortcut everywhere. A section is the unit an owner
 * actually reuses (a whole address block, a whole signature area), so it is
 * the more valuable of the two.
 */
describe('useClipboard — sections', () => {
  it('copies a section and pastes it onto a page', () => {
    const d = doc([el()]);
    const { result } = renderHook(() => useClipboard());

    act(() => result.current.copySections(d, ['s1']));
    let next: FormDocument = d;
    act(() => {
      next = result.current.paste(d, 's1', 'p1').document;
    });

    expect(sectionsOf(next)).toHaveLength(2);
  });

  it('gives the copy fresh ids and fresh field keys', () => {
    const d = doc([el()]);
    const { result } = renderHook(() => useClipboard());

    act(() => result.current.copySections(d, ['s1']));
    let next: FormDocument = d;
    act(() => {
      next = result.current.paste(d, 's1', 'p1').document;
    });

    const ids = sectionsOf(next).map((s) => s.id);
    expect(new Set(ids).size).toBe(2);
    // Two components on one submission key would both render, both be filled,
    // and whichever serialised last would silently win (§11, §20).
    const keys = elementsOf(next).map((e) => e.field?.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('cut removes the section and still pastes it back', () => {
    const d = doc([el()]);
    const { result } = renderHook(() => useClipboard());

    let afterCut: FormDocument = d;
    act(() => {
      afterCut = result.current.cutSections(d, ['s1']).document;
    });
    expect(sectionsOf(afterCut)).toHaveLength(0);

    let next: FormDocument = afterCut;
    act(() => {
      next = result.current.paste(afterCut, null, 'p1').document;
    });
    expect(sectionsOf(next)).toHaveLength(1);
  });

  it('duplicates a section in place', () => {
    const d = doc([el()]);
    const { result } = renderHook(() => useClipboard());

    let next: FormDocument = d;
    act(() => {
      next = result.current.duplicateSections(d, ['s1']).document;
    });

    expect(sectionsOf(next)).toHaveLength(2);
    // Duplicating must not disturb what is on the clipboard.
    expect(result.current.hasContent).toBe(false);
  });
});
