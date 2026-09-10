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
  moveSectionToPage,
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
  pullUpOneLine,
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
 * processor. But with the caret in an empty line above an image, Backspace has
 * to do what it does in Word: eat ONE line and let the image come up by one
 * line, again on the next press. Closing the whole gap at once takes the
 * owner's control away and is hard to undo by eye.
 */
describe('pullUpOneLine', () => {
  const stacked = (elements: FormElement[]): FormDocument => ({
    version: 3,
    page: emptyPageGeometry(),
    pages: [{ id: 'p1', sections: [{ id: 's1', title: '', x: 48, y: 48, width: 400, height: 400, elements }] }],
  });

  const LINE = 40;
  const gap = (over: Partial<FormElement> = {}) =>
    ({ id: 'gap', type: 'TEXT', x: 0, y: 40, width: 320, height: LINE, ...over }) as FormElement;
  const picture = (over: Partial<FormElement> = {}) =>
    ({ id: 'img', type: 'IMAGE', x: 0, y: 200, width: 200, height: 200, ...over }) as FormElement;

  it('brings the picture up by one line, not by the whole gap', () => {
    const result = pullUpOneLine(stacked([gap(), picture()]), 'gap', LINE);

    expect(findElement(result.document, 'img')?.y).toBe(160);
  });

  it('leaves the empty line in place so the next press moves the next line', () => {
    const result = pullUpOneLine(stacked([gap(), picture()]), 'gap', LINE);

    expect(findElement(result.document, 'gap')).toBeDefined();
  });

  it('walks the picture up a line at a time', () => {
    let doc = stacked([gap(), picture()]);
    const seen: (number | undefined)[] = [];
    for (let press = 0; press < 4; press += 1) {
      doc = pullUpOneLine(doc, 'gap', LINE).document;
      seen.push(findElement(doc, 'img')?.y);
    }

    // 200 -> 160 -> 120 -> 80 -> 40, landing flush against the line above it.
    expect(seen).toEqual([160, 120, 80, 40]);
  });

  /* Less than a line left: take only what is there rather than jumping past. */
  it('never overshoots the line above it', () => {
    const result = pullUpOneLine(stacked([gap(), picture({ y: 55 })]), 'gap', LINE);

    expect(findElement(result.document, 'img')?.y).toBe(40);
  });

  /* With the space used up, Backspace does its other job. */
  it('deletes the empty line once there is no space left to take', () => {
    const result = pullUpOneLine(stacked([gap(), picture({ y: 40 })]), 'gap', LINE);

    expect(findElement(result.document, 'gap')).toBeUndefined();
  });

  it('deletes the empty line when nothing is underneath', () => {
    const above = { id: 'above', type: 'TEXT', x: 0, y: 0, width: 320, height: 40 } as FormElement;
    const result = pullUpOneLine(stacked([above, gap()]), 'gap', LINE);

    expect(findElement(result.document, 'gap')).toBeUndefined();
    expect(findElement(result.document, 'above')?.y).toBe(0);
  });

  it('keeps the spacing between everything that moves', () => {
    const trailing = { id: 'after', type: 'TEXT', x: 0, y: 300, width: 320, height: 40 } as FormElement;
    const result = pullUpOneLine(stacked([gap(), picture(), trailing]), 'gap', LINE);

    expect(findElement(result.document, 'img')?.y).toBe(160);
    expect(findElement(result.document, 'after')?.y).toBe(260);
  });

  /* Boxes on the same line are neighbours, not things underneath. */
  it('leaves a box beside the empty line where it is', () => {
    const beside = { id: 'beside', type: 'TEXT', x: 340, y: 40, width: 200, height: 40 } as FormElement;
    const result = pullUpOneLine(stacked([gap(), beside, picture()]), 'gap', LINE);

    expect(findElement(result.document, 'beside')?.y).toBe(40);
    expect(findElement(result.document, 'img')?.y).toBe(160);
  });

  /* A line dropped into a gap smaller than itself overlaps what follows;
   * measuring from its bottom edge would move nothing at all. */
  it('still moves what it overlaps', () => {
    const result = pullUpOneLine(stacked([gap({ y: 100 }), picture({ y: 120 })]), 'gap', LINE);

    expect(findElement(result.document, 'img')?.y).toBe(100);
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

/*
 * SPACE-AWARE REPOSITIONING.
 *
 * The ladder's rung 2 answers "who do I push?". These cases are about the
 * question that now runs BEFORE it: "does anybody have to move at all?" A
 * section dropped where the page is already empty must land there and leave
 * the document alone — no push, no cascade, no new page (spec §1, §10).
 */
describe('a moved section uses the empty space that is already there', () => {
  const sec = (id: string, y: number, height: number): FormSection =>
    section({ id, y, height, x: 48, width: 500 });
  const onePage = (sections: FormSection[]) => doc([{ id: 'p1', sections }]);
  const at = (d: FormDocument, id: string) => findSection(d, id)!.section;
  const order = (d: FormDocument, index = 0) => d.pages[index].sections.map((s) => s.id);

  /* CASE 1: a big gap above, and a section dragged up into it. Nothing else
   * has any reason to move, so nothing else does. */
  it('drops a section into a gap above without pushing what is below it', () => {
    const before = onePage([sec('a', 48, 100), sec('b', 600, 100), sec('c', 750, 100)]);

    const result = moveSection(before, 'c', 48, 300);

    expect(result.refusal).toBeNull();
    expect(at(result.document, 'c').y).toBe(300);
    expect(at(result.document, 'a').y).toBe(48);
    expect(at(result.document, 'b').y).toBe(600);
    expect(result.document.pages).toHaveLength(1);
  });

  /* CASE 2: the same thing downward. Empty space below is space, not a void
   * to be pushed into existence (spec §12). */
  it('drops a section into a gap below without dragging its neighbours along', () => {
    const before = onePage([sec('a', 48, 100), sec('b', 200, 100)]);

    const result = moveSection(before, 'a', 48, 700);

    expect(at(result.document, 'a').y).toBe(700);
    expect(at(result.document, 'b').y).toBe(200);
    expect(result.document.pages).toHaveLength(1);
  });

  /* A drop that clips a neighbour but plainly AIMED at the gap beside it
   * settles into the gap. This is the whole difference between "I am moving
   * into space" and "I am colliding with you" — the two used to be the same
   * event.
   *
   * `useFreeSpace` is what a DROP passes. It is opt-in because the same
   * function carries the arrow nudge and align/distribute, which must land on
   * the exact coordinate they were given — and because a clamp this generous
   * applied to every frame of a drag freezes the section and then leaps. */
  it('slides a section that clips a neighbour into the free gap instead of shoving it', () => {
    const before = onePage([sec('a', 48, 100), sec('b', 400, 100), sec('c', 700, 100)]);

    // 350 overlaps b (400-500); the gap between a and b runs 156-392.
    const result = moveSection(before, 'c', 48, 350, { useFreeSpace: true });

    expect(at(result.document, 'c').y).toBe(292);
    expect(at(result.document, 'b').y).toBe(400);
    expect(at(result.document, 'a').y).toBe(48);
    expect(result.document.pages).toHaveLength(1);
  });

  /*
   * THE SAME MOVE, WITHOUT THE OPT-IN, LANDS WHERE IT WAS TOLD.
   *
   * Align, distribute and the arrow keys all route through `moveSection`, and
   * all three compute an exact coordinate before calling it. A settle that
   * slid one of them into a nearby gap would mean align did not align and one
   * press of an arrow key moved a section seventy pixels. The default is
   * therefore "put it exactly there, and push whatever is in the way".
   */
  it('lands on the exact coordinate when the caller has not asked for free space', () => {
    const before = onePage([sec('a', 48, 100), sec('b', 400, 100), sec('c', 700, 100)]);

    const result = moveSection(before, 'c', 48, 350);

    expect(at(result.document, 'c').y).toBe(350);
    expect(at(result.document, 'b').y).toBe(458);
  });

  /*
   * A GAP THE SECTION IS NOWHERE NEAR IS NOT ITS GAP.
   *
   * The band has to be one the dropped section actually overlaps. Without
   * that rule the settle picks purely by distance, so a section dropped on a
   * crowded stretch of page can be answered with the nearest gap even when
   * that gap is somewhere it never went — a teleport wearing a snap's
   * clothing. It also makes `freeBands`' side-by-side guarantee explicit:
   * a band that exists only because nothing spans that height can no longer
   * be handed a section that is not there.
   */
  it('ignores a free band the dropped section does not reach', () => {
    // a ends at 68 and b starts at 150, so there is a band at 48-142. c is
    // only 40 tall, which is what makes this reachable at all: the band's
    // bottom edge sits 48px above where c was dropped, inside the tolerance,
    // while c's own span (150-190) never touches the band.
    const before = onePage([sec('a', 48, 20), sec('b', 150, 200), sec('c', 800, 40)]);

    const result = moveSection(before, 'c', 48, 150, { useFreeSpace: true });

    // Without the overlap rule c would be answered with y=102 — a gap it was
    // never in. It stays where it was put, and b takes the push.
    expect(at(result.document, 'c').y).toBe(150);
    expect(at(result.document, 'b').y).toBe(198);
    expect(at(result.document, 'a').y).toBe(48);
  });

  /* CASE 3: with no gap to fall into, a real collision still reflows — and
   * still reflows ONLY what it has to (spec §6). */
  it('still pushes a neighbour when the space genuinely is not there', () => {
    const before = onePage([sec('a', 48, 100), sec('b', 200, 100), sec('d', 320, 100)]);

    const result = moveSection(before, 'd', 48, 210);

    expect(at(result.document, 'd').y).toBe(210);
    expect(at(result.document, 'b').y).toBe(318);
    expect(at(result.document, 'a').y).toBe(48);
    expect(result.document.pages).toHaveLength(1);
  });

  /* CASE 5: a page with little room left still uses the room it HAS rather
   * than spilling onto the next page (spec §8). */
  it('lands a section from another page in the current page\'s free space', () => {
    const before = doc([
      { id: 'p1', sections: [sec('a', 48, 400), sec('b', 700, 300)] },
      { id: 'p2', sections: [sec('c', 48, 200)] },
    ]);

    const result = moveSectionToPage(before, 'c', 'p1', 48, 550, { useFreeSpace: true });

    expect(at(result.document, 'c').y).toBe(492);
    expect(at(result.document, 'b').y).toBe(700);
    expect(result.document.pages).toHaveLength(2);
    expect(result.document.pages[1].sections).toEqual([]);
  });

  /* CASE 6: the overflow ladder is untouched underneath all of this. */
  it('falls back to relocating a displaced section when the page really is full', () => {
    const before = doc([{ id: 'p1', sections: [sec('a', 48, 500), sec('b', 560, 500)] }]);

    const result = moveSection(before, 'b', 48, 100);

    expect(order(result.document, 0)).toEqual(['b']);
    expect(order(result.document, 1)).toEqual(['a']);
    expect(at(result.document, 'a').y).toBe(DEFAULT_MARGIN.top);
  });

  /* Spec §14: the array IS the document order — what the renderer emits and
   * what a screen reader reads. A section dragged above another must become
   * earlier in it, not merely look earlier. */
  it('keeps the document order in step with the visual order', () => {
    const before = onePage([sec('a', 48, 100), sec('b', 300, 100), sec('c', 600, 100)]);

    const result = moveSection(before, 'c', 48, 180);

    expect(order(result.document)).toEqual(['a', 'c', 'b']);
  });

  /* The nudge belongs to MOVES only. A section being resized is not asking to
   * relocate, so growth that reaches a neighbour pushes it, exactly as before. */
  it('never relocates a section that is only being resized', () => {
    const before = onePage([sec('a', 48, 100), sec('b', 400, 100)]);

    const result = resizeSection(before, 'a', { x: 48, y: 48, width: 500, height: 400 });

    expect(at(result.document, 'a').y).toBe(48);
    expect(at(result.document, 'b').y).toBe(456);
  });

  /* CASES 7 and 8: undo and redo are whole-document snapshots, so the one
   * thing they need from a move is that it never touches the document it was
   * given. */
  it('leaves the document it was handed untouched, so one undo restores it', () => {
    const before = onePage([sec('a', 48, 100), sec('b', 600, 100)]);
    const snapshot = JSON.parse(JSON.stringify(before));

    moveSection(before, 'b', 48, 200);

    expect(before).toEqual(snapshot);
  });
});
