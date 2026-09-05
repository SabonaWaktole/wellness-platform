import { describe, it, expect } from 'vitest';
import {
  addPage,
  insertPageAt,
  deletePage,
  duplicatePage,
  reorderPage,
  removeEmptyPages,
  addSection,
  moveSection,
  resizeSection,
  addElement,
  moveElement,
  resizeElement,
  removeElement,
  removeSection,
  findSection,
  findElement,
  pageContainingSection,
  stripSyntheticPages,
  usableHeight,
  emptyDocument,
  applyBoxes,
  normaliseControls,
  removeElementClosingGap,
  pruneEmptyTextHosts,
} from './layoutOps';
import {
  A4_PORTRAIT,
  DEFAULT_MARGIN,
  UNPLACED_PAGE_ID,
  emptyPageGeometry,
  type FormDocument,
  type FormElement,
  type FormSection,
} from '../../../types/form';

const USABLE = A4_PORTRAIT.height - DEFAULT_MARGIN.top - DEFAULT_MARGIN.bottom;

const section = (over: Partial<FormSection> = {}): FormSection => ({
  id: 's1',
  title: 'Section',
  x: 48,
  y: 48,
  width: 400,
  height: 200,
  elements: [],
  ...over,
});

const el = (over: Partial<FormElement> = {}): FormElement => ({
  id: 'e1',
  type: 'TEXT',
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  ...over,
});

const doc = (pages: { id: string; sections: FormSection[] }[]): FormDocument => ({
  version: 3,
  page: emptyPageGeometry(),
  pages,
});

const allSectionIds = (d: FormDocument) => d.pages.map((p) => p.sections.map((s) => s.id));

describe('usableHeight', () => {
  it('is the page height minus both vertical margins', () => {
    expect(usableHeight(emptyPageGeometry())).toBe(USABLE);
  });
});

describe('page management', () => {
  it('addPage appends a page with a fresh id, preserving every existing page id', () => {
    const d = doc([{ id: 'p1', sections: [] }]);
    const next = addPage(d).document;

    expect(next.pages).toHaveLength(2);
    expect(next.pages[0].id).toBe('p1');
    expect(next.pages[1].id).not.toBe('p1');
  });

  it('insertPageAt inserts at the break point, shifting everything below WITHOUT reassigning ids', () => {
    const d = doc([
      { id: 'p1', sections: [section({ id: 'a' })] },
      { id: 'p2', sections: [section({ id: 'b' })] },
      { id: 'p3', sections: [section({ id: 'c' })] },
    ]);

    const next = insertPageAt(d, 1).document;

    expect(next.pages.map((p) => p.id).slice(0, 1)).toEqual(['p1']);
    expect(next.pages).toHaveLength(4);
    // p2 and p3 kept their ids and their content, just moved down one slot.
    expect(next.pages[2].id).toBe('p2');
    expect(next.pages[3].id).toBe('p3');
    expect(next.pages[2].sections[0].id).toBe('b');
    expect(next.pages[1].sections).toEqual([]);
  });

  it('deletePage refuses to remove the last remaining page', () => {
    const d = doc([{ id: 'p1', sections: [] }]);
    const result = deletePage(d, 'p1');

    expect(result.refusal).toBeTruthy();
    expect(result.document).toEqual(d);
  });

  it('duplicatePage deep-copies with fresh section/element ids but keeps geometry', () => {
    const d = doc([
      { id: 'p1', sections: [section({ id: 's1', elements: [el({ id: 'e1' })] })] },
    ]);

    const next = duplicatePage(d, 'p1').document;
    const copy = next.pages[1];

    expect(next.pages).toHaveLength(2);
    expect(copy.id).not.toBe('p1');
    expect(copy.sections[0].id).not.toBe('s1');
    expect(copy.sections[0].elements[0].id).not.toBe('e1');
    expect(copy.sections[0].x).toBe(48);
    expect(copy.sections[0].height).toBe(200);
  });

  it('reorderPage moves a page without changing any id', () => {
    const d = doc([
      { id: 'p1', sections: [] },
      { id: 'p2', sections: [] },
      { id: 'p3', sections: [] },
    ]);

    const next = reorderPage(d, 'p3', 0).document;
    expect(next.pages.map((p) => p.id)).toEqual(['p3', 'p1', 'p2']);
  });

  it('removeEmptyPages drops empty pages but never the last one', () => {
    const d = doc([
      { id: 'p1', sections: [section()] },
      { id: 'p2', sections: [] },
      { id: 'p3', sections: [] },
    ]);
    expect(removeEmptyPages(d).document.pages.map((p) => p.id)).toEqual(['p1']);

    const allEmpty = doc([{ id: 'p1', sections: [] }, { id: 'p2', sections: [] }]);
    expect(removeEmptyPages(allEmpty).document.pages).toHaveLength(1);
  });
});

/* =========================================================================
 * THE FOUR-RUNG OVERFLOW LADDER (spec §6 + §7)
 * A section cannot split, so THE SECTION IS WHAT MOVES, never the content.
 * ========================================================================= */
describe('overflow ladder', () => {
  describe('rung 1 — grow in place', () => {
    it('grows a section to fit an element while it stays inside the bottom margin', () => {
      const d = doc([{ id: 'p1', sections: [section({ height: 100 })] }]);

      const next = addElement(d, 's1', el({ y: 120, height: 40 })).document;
      const s = findSection(next, 's1')!.section;

      expect(s.height).toBeGreaterThanOrEqual(160);
      expect(s.y + s.height).toBeLessThanOrEqual(A4_PORTRAIT.height - DEFAULT_MARGIN.bottom);
      expect(next.pages).toHaveLength(1);
    });
  });

  describe('rung 2 — push siblings, relocating one that would overhang', () => {
    it('pushes a lower sibling down when the grown section would overlap it', () => {
      const d = doc([
        {
          id: 'p1',
          sections: [section({ id: 'top', y: 48, height: 100 }), section({ id: 'below', y: 160, height: 100 })],
        },
      ]);

      const next = resizeSection(d, 'top', { x: 48, y: 48, width: 400, height: 300 }).document;
      const below = findSection(next, 'below')!.section;

      expect(below.y).toBeGreaterThanOrEqual(48 + 300);
    });

    it('relocates a pushed sibling to the next page instead of letting it overhang', () => {
      const d = doc([
        {
          id: 'p1',
          sections: [
            section({ id: 'top', y: 48, height: 100 }),
            section({ id: 'below', y: 200, height: 300 }),
          ],
        },
      ]);

      // Grow `top` so far that `below` cannot fit underneath it on this page.
      const next = resizeSection(d, 'top', { x: 48, y: 48, width: 400, height: USABLE - 100 }).document;

      expect(next.pages.length).toBeGreaterThanOrEqual(2);
      expect(pageContainingSection(next, 'below')!.id).not.toBe('p1');
      // Relocation preserves the section id.
      expect(findSection(next, 'below')).toBeDefined();
    });
  });

  describe('rung 3 — relocate the whole section to the next page', () => {
    it('moves a section that would cross the bottom margin onto a newly inserted page', () => {
      const d = doc([{ id: 'p1', sections: [section({ id: 's1', y: 600, height: 200 })] }]);

      // Resize so s1 runs past the usable bottom edge.
      const next = resizeSection(d, 's1', { x: 48, y: 600, width: 400, height: 600 }).document;

      expect(next.pages.length).toBe(2);
      expect(pageContainingSection(next, 's1')!.id).not.toBe('p1');
      expect(findSection(next, 's1')!.section.y).toBe(DEFAULT_MARGIN.top);
    });

    it('relocates onto the EXISTING next page when it has room, without inserting a blank one', () => {
      const d = doc([
        { id: 'p1', sections: [section({ id: 'overflowing', y: 600, height: 200 })] },
        { id: 'p2', sections: [section({ id: 'later' })] },
      ]);

      const next = resizeSection(d, 'overflowing', { x: 48, y: 600, width: 400, height: 600 }).document;

      // Lands on the page right after p1 — never appended past p2, and no
      // gratuitous blank page when p2 can hold it.
      expect(next.pages).toHaveLength(2);
      expect(pageContainingSection(next, 'overflowing')!.id).toBe('p2');
      expect(next.pages[1].id).toBe('p2');
    });

    /*
     * READING ORDER. Content that overflowed from page N precedes the content
     * already sitting on page N+1, so it is inserted ABOVE it and pushes it
     * down — appending underneath would silently reorder the document.
     */
    it('places relocated content ABOVE what already lived on the next page', () => {
      const d = doc([
        { id: 'p1', sections: [section({ id: 'overflowing', y: 600, height: 200 })] },
        { id: 'p2', sections: [section({ id: 'later', y: 48, height: 200 })] },
      ]);

      const next = resizeSection(d, 'overflowing', { x: 48, y: 600, width: 400, height: 400 }).document;

      const moved = findSection(next, 'overflowing')!;
      const later = findSection(next, 'later')!;
      expect(moved.pageIndex).toBeLessThanOrEqual(later.pageIndex);
      if (moved.pageIndex === later.pageIndex) {
        expect(moved.section.y).toBeLessThan(later.section.y);
      }
    });

    it('inserts a page AT THE BREAK POINT when the next page cannot absorb the overflow', () => {
      const d = doc([
        { id: 'p1', sections: [section({ id: 'overflowing', y: 600, height: 200 })] },
        { id: 'p2', sections: [section({ id: 'later', y: 48, height: USABLE - 100 })] },
        { id: 'p3', sections: [section({ id: 'last' })] },
      ]);

      const next = resizeSection(d, 'overflowing', { x: 48, y: 600, width: 400, height: 600 }).document;

      // `later` no longer fits under the arrival, so it cascades onward — but
      // p3 and its content keep their identity and stay after everything.
      expect(pageContainingSection(next, 'overflowing')!.id).toBe('p2');
      expect(findSection(next, 'later')).toBeDefined();
      expect(findSection(next, 'last')).toBeDefined();
      expect(next.pages.map((p) => p.id)).toContain('p3');
    });
  });

  describe('rung 4 — hard stop', () => {
    it('REFUSES a resize that makes a section taller than one usable page, leaving the document untouched', () => {
      const d = doc([{ id: 'p1', sections: [section({ id: 's1', y: 48, height: 200 })] }]);

      const result = resizeSection(d, 's1', { x: 48, y: 48, width: 400, height: USABLE + 200 });

      expect(result.refusal).toBeTruthy();
      expect(result.refusal).toMatch(/fills the page/i);
      expect(result.document).toEqual(d);
    });

    it('REFUSES an element that would force its section past one usable page', () => {
      const d = doc([{ id: 'p1', sections: [section({ id: 's1', y: 48, height: 200 })] }]);

      const result = addElement(d, 's1', el({ y: USABLE + 100, height: 40 }));

      expect(result.refusal).toBeTruthy();
      expect(result.document).toEqual(d);
    });
  });
});

describe('overflow ladder — corollaries', () => {
  it('an element dragged past its section bottom grows the section, never clips or snaps back', () => {
    const d = doc([{ id: 'p1', sections: [section({ height: 100, elements: [el({ id: 'e1' })] })] }]);

    const next = moveElement(d, 'e1', 0, 200).document;

    expect(findElement(next, 'e1')!.y).toBe(200);
    expect(findSection(next, 's1')!.section.height).toBeGreaterThanOrEqual(240);
  });

  it('a section dragged past the bottom margin drops onto the next page', () => {
    const d = doc([
      { id: 'p1', sections: [section({ id: 's1', height: 200 })] },
      { id: 'p2', sections: [] },
    ]);

    const next = moveSection(d, 's1', 48, A4_PORTRAIT.height - 100).document;

    expect(pageContainingSection(next, 's1')!.id).toBe('p2');
  });

  it('a section dragged above the top margin drops onto the previous page', () => {
    const d = doc([
      { id: 'p1', sections: [] },
      { id: 'p2', sections: [section({ id: 's1', y: 48, height: 200 })] },
    ]);

    const next = moveSection(d, 's1', 48, -80).document;

    expect(pageContainingSection(next, 's1')!.id).toBe('p1');
  });

  it('relocation preserves the section id, its element ids, and every page id', () => {
    const d = doc([
      { id: 'p1', sections: [section({ id: 's1', y: 600, height: 200, elements: [el({ id: 'e1' })] })] },
      { id: 'p2', sections: [section({ id: 's2' })] },
    ]);

    const next = resizeSection(d, 's1', { x: 48, y: 600, width: 400, height: 600 }).document;

    expect(findSection(next, 's1')).toBeDefined();
    expect(findElement(next, 'e1')).toBeDefined();
    expect(next.pages.map((p) => p.id)).toContain('p1');
    expect(next.pages.map((p) => p.id)).toContain('p2');
  });

  it('a relocation that inserts a page is ONE atomic result, so one undo reverses both', () => {
    const d = doc([{ id: 'p1', sections: [section({ id: 's1', y: 600, height: 200 })] }]);

    const result = resizeSection(d, 's1', { x: 48, y: 600, width: 400, height: 600 });

    // Single returned document containing BOTH the new page and the moved
    // section — the history layer snapshots one entry, never two.
    expect(result.refusal).toBeNull();
    expect(result.document.pages).toHaveLength(2);
    expect(pageContainingSection(result.document, 's1')!.id).not.toBe('p1');
    expect(d.pages).toHaveLength(1); // original untouched (immutability)
  });

  it('does NOT auto-remove a page left empty by an edit', () => {
    const d = doc([
      { id: 'p1', sections: [section({ id: 's1' })] },
      { id: 'p2', sections: [] },
    ]);

    const next = removeSection(d, 's1').document;

    expect(next.pages).toHaveLength(2);
  });
});

describe('sections and elements', () => {
  it('addSection places a section on the named page', () => {
    const d = doc([{ id: 'p1', sections: [] }, { id: 'p2', sections: [] }]);

    const next = addSection(d, 'p2', 'New', { x: 48, y: 48, width: 300, height: 150 }).document;

    expect(allSectionIds(next)[0]).toEqual([]);
    expect(allSectionIds(next)[1]).toHaveLength(1);
  });

  it('keeps an element inside its section horizontally', () => {
    const d = doc([{ id: 'p1', sections: [section({ width: 200, elements: [el({ id: 'e1' })] })] }]);

    const next = moveElement(d, 'e1', 500, 0).document;

    expect(findElement(next, 'e1')!.x).toBeLessThanOrEqual(200 - 100);
  });

  it('resizeElement caps element width at the section width', () => {
    const d = doc([{ id: 'p1', sections: [section({ width: 200, elements: [el({ id: 'e1' })] })] }]);

    const next = resizeElement(d, 'e1', { x: 0, y: 0, width: 900, height: 40 }).document;

    expect(findElement(next, 'e1')!.width).toBeLessThanOrEqual(200);
  });

  it('removeElement deletes only the named element', () => {
    const d = doc([
      { id: 'p1', sections: [section({ elements: [el({ id: 'e1' }), el({ id: 'e2', y: 60 })] })] },
    ]);

    const next = removeElement(d, 'e1').document;

    expect(findElement(next, 'e1')).toBeUndefined();
    expect(findElement(next, 'e2')).toBeDefined();
  });
});

describe('stripSyntheticPages', () => {
  it('removes the server-side rescue page so it is never saved back', () => {
    const d = doc([
      { id: 'p1', sections: [section()] },
      { id: UNPLACED_PAGE_ID, sections: [section({ id: 'unplaced' })] },
    ]);

    expect(stripSyntheticPages(d).pages.map((p) => p.id)).toEqual(['p1']);
  });
});

describe('emptyDocument', () => {
  it('is a single genuinely blank A4 page (spec §34)', () => {
    const d = emptyDocument();
    expect(d.version).toBe(3);
    expect(d.pages).toHaveLength(1);
    expect(d.pages[0].sections).toEqual([]);
    expect(d.page.width).toBe(A4_PORTRAIT.width);
  });
});


/*
 * `alignBoxes` and `distributeBoxes` produce geometry; something has to write
 * that geometry back. Doing it by calling `moveElement` in a loop from the UI
 * would skip the guarantee that makes the ladder trustworthy — a batch that
 * cannot fit must be rejected WHOLE, never half-applied.
 */
describe('applyBoxes', () => {
  const twoElements = (): FormDocument => ({
    version: 3,
    page: emptyPageGeometry(),
    pages: [
      {
        id: 'p1',
        sections: [
          {
            id: 's1',
            title: 'S',
            x: 48,
            y: 48,
            width: 400,
            height: 300,
            elements: [
              { id: 'e1', type: 'TEXT', x: 10, y: 10, width: 100, height: 40 },
              { id: 'e2', type: 'TEXT', x: 200, y: 80, width: 100, height: 40 },
            ],
          },
        ],
      },
    ],
  });

  it('writes an aligned batch back through the ladder', () => {
    const doc = twoElements();
    const result = applyBoxes(doc, 'element', [
      { id: 'e1', x: 10, y: 10, width: 100, height: 40 },
      { id: 'e2', x: 10, y: 80, width: 100, height: 40 },
    ]);

    expect(result.refusal).toBeNull();
    expect(findElement(result.document, 'e2')?.x).toBe(10);
    expect(findElement(result.document, 'e1')?.x).toBe(10);
  });

  it('leaves the document untouched when the batch names something missing', () => {
    const doc = twoElements();
    const result = applyBoxes(doc, 'element', [{ id: 'nope', x: 0, y: 0, width: 10, height: 10 }]);

    expect(result.document).toEqual(doc);
  });
});

/*
 * A document seeded or migrated outside the builder can carry a control its
 * data type cannot be shown in. The server refuses such a pairing on save, so
 * before this every save of "Client Intake" failed on the first mismatch:
 * autosave retried and failed forever and the form could not be edited at all.
 */
describe('normaliseControls', () => {
  const withField = (type: FormElement['type'], dataType: string): FormDocument => ({
    version: 3,
    page: emptyPageGeometry(),
    pages: [
      {
        id: 'p1',
        sections: [
          {
            id: 's1',
            title: 'S',
            x: 48,
            y: 48,
            width: 400,
            height: 300,
            elements: [
              {
                id: 'e1',
                type,
                x: 10,
                y: 10,
                width: 200,
                height: 60,
                field: { key: 'k', label: 'L', dataType, required: false },
              } as FormElement,
            ],
          },
        ],
      },
    ],
  });

  const controlOf = (doc: FormDocument) => findElement(doc, 'e1')?.type;

  it.each([
    ['BOOLEAN', 'CHECKBOX_GROUP'],
    ['SINGLE_SELECT', 'DROPDOWN'],
    ['MULTI_SELECT', 'CHECKBOX_GROUP'],
    ['DATE', 'DATE'],
    ['SIGNATURE', 'SIGNATURE'],
    ['USER_REFERENCE', 'USER_SELECT'],
  ])('moves a %s stored as INPUT onto %s', (dataType, expected) => {
    expect(controlOf(normaliseControls(withField('INPUT', dataType)))).toBe(expected);
  });

  /* A pairing the server already accepts is left exactly as the owner set it —
   * TEXT may be either an INPUT or a TEXTAREA, and the choice is theirs. */
  it.each([
    ['TEXT', 'TEXTAREA'],
    ['TEXT', 'INPUT'],
    ['LONG_TEXT', 'INPUT'],
    ['SINGLE_SELECT', 'RADIO_GROUP'],
  ])('leaves a %s shown as %s alone', (dataType, type) => {
    expect(controlOf(normaliseControls(withField(type as FormElement['type'], dataType)))).toBe(type);
  });

  it('keeps the field, its key and its geometry untouched', () => {
    const before = withField('INPUT', 'BOOLEAN');
    const after = normaliseControls(before);
    const element = findElement(after, 'e1')!;

    expect(element.field).toEqual(findElement(before, 'e1')!.field);
    expect([element.x, element.y, element.width, element.height]).toEqual([10, 10, 200, 60]);
  });

  /* THE FAILURE THAT STARTED THIS: nothing may be dropped. A repair that lost
   * the element would trade an unsavable form for a silently emptied one. */
  it('repairs in place without dropping anything', () => {
    const doc = withField('INPUT', 'BOOLEAN');
    const after = normaliseControls(doc);

    expect(after.pages).toHaveLength(1);
    expect(after.pages[0].sections).toHaveLength(1);
    expect(after.pages[0].sections[0].elements).toHaveLength(1);
  });

  it('leaves presentation-only elements, which have no field, alone', () => {
    const doc = emptyDocument();
    expect(normaliseControls(doc)).toEqual(doc);
  });
});

/*
 * BACKSPACE IN AN EMPTY LINE ABOVE A PICTURE.
 *
 * Free-placed text sits on a page whose layout is absolute — nothing pushes
 * anything else, which is what makes this a form builder rather than a word
 * processor. But with the caret in an empty line above an image, Backspace
 * has to do what it does in Word: take the line away and let the image come
 * up. Removing alone leaves a hole exactly the size of the line.
 */
describe('removeElementClosingGap', () => {
  const stacked = (elements: FormElement[]): FormDocument => ({
    version: 3,
    page: emptyPageGeometry(),
    pages: [{ id: 'p1', sections: [{ id: 's1', title: '', x: 48, y: 48, width: 400, height: 400, elements }] }],
  });

  const gap = (over: Partial<FormElement> = {}) =>
    ({ id: 'gap', type: 'TEXT', x: 0, y: 40, width: 320, height: 40, ...over }) as FormElement;
  const picture = (over: Partial<FormElement> = {}) =>
    ({ id: 'img', type: 'IMAGE', x: 0, y: 120, width: 200, height: 200, ...over }) as FormElement;

  it('pulls the picture up to where the deleted line began', () => {
    const result = removeElementClosingGap(stacked([gap(), picture()]), 'gap');

    expect(findElement(result.document, 'gap')).toBeUndefined();
    expect(findElement(result.document, 'img')?.y).toBe(40);
  });

  it('keeps the spacing between everything that moves', () => {
    const trailing = { id: 'after', type: 'TEXT', x: 0, y: 400, width: 320, height: 40 } as FormElement;
    const result = removeElementClosingGap(stacked([gap(), picture(), trailing]), 'gap');

    // The picture closed an 80px gap, so the block below it moves the same.
    expect(findElement(result.document, 'img')?.y).toBe(40);
    expect(findElement(result.document, 'after')?.y).toBe(320);
  });

  /* A line dropped into a gap smaller than itself overlaps what follows;
   * measuring against its bottom edge would close no gap at all. */
  it('closes the gap even when the deleted line overlapped the picture', () => {
    const result = removeElementClosingGap(stacked([gap({ y: 100, height: 40 }), picture({ y: 120 })]), 'gap');

    expect(findElement(result.document, 'img')?.y).toBe(100);
  });

  /* Boxes on the same line are neighbours, not things underneath. */
  it('leaves a box beside the deleted one where it is', () => {
    const beside = { id: 'beside', type: 'TEXT', x: 340, y: 40, width: 200, height: 40 } as FormElement;
    const result = removeElementClosingGap(stacked([gap(), beside, picture()]), 'gap');

    expect(findElement(result.document, 'beside')?.y).toBe(40);
    expect(findElement(result.document, 'img')?.y).toBe(40);
  });

  it('is a plain delete when nothing is underneath', () => {
    const above = { id: 'above', type: 'TEXT', x: 0, y: 0, width: 320, height: 40 } as FormElement;
    const result = removeElementClosingGap(stacked([above, gap()]), 'gap');

    expect(findElement(result.document, 'gap')).toBeUndefined();
    expect(findElement(result.document, 'above')?.y).toBe(0);
  });

  it('never lifts anything above the top of its section', () => {
    const result = removeElementClosingGap(stacked([gap({ y: 0 }), picture({ y: 10 })]), 'gap');

    expect(findElement(result.document, 'img')?.y).toBe(0);
  });
});

describe('pruneEmptyTextHosts', () => {
  const doc = (sections): FormDocument => ({
    version: 3,
    page: emptyPageGeometry(),
    pages: [{ id: 'p1', sections }],
  });
  const section = (id: string, elements: FormElement[] = []) =>
    ({ id, title: '', x: 48, y: 48, width: 320, height: 40, elements });
  const text = { id: 't1', type: 'TEXT', x: 0, y: 0, width: 320, height: 40 } as FormElement;

  /* A host with nothing in it renders nothing, draws no chrome and cannot be
   * selected — so nobody can ever remove it by hand. */
  it('drops a host that holds nothing', () => {
    const result = pruneEmptyTextHosts(doc([section('text-host-a'), section('text-host-b', [text])]));

    expect(result.pages[0].sections.map((s) => s.id)).toEqual(['text-host-b']);
  });

  /* An empty section the OWNER placed is a deliberate space on the page. */
  it('leaves an empty section the owner made alone', () => {
    const result = pruneEmptyTextHosts(doc([section('s1'), section('text-host-a')]));

    expect(result.pages[0].sections.map((s) => s.id)).toEqual(['s1']);
  });

  it('leaves a document with nothing to prune untouched', () => {
    const original = doc([section('s1', [text])]);
    expect(pruneEmptyTextHosts(original)).toEqual(original);
  });
});
