import {
  A4_PORTRAIT,
  DEFAULT_MARGIN,
  MAX_PAGE_COUNT,
  MAX_SIZE_PX,
  MIN_SIZE_PX,
  TEXT_HOST_PREFIX,
  UNPLACED_PAGE_ID,
  UNPLACED_SECTION_ID,
  isTextHostSection,
  emptyPageGeometry,
  usablePageHeight,
  usablePageWidth,
  type DocumentPage,
  type FormDocument,
  type FormElement,
  type FormPage,
  type FormSection,
} from '../../../types/form';
import { componentOptionsFor } from '../FormRenderer/fieldControl';

/**
 * Pure transforms over a FormDocument (v3). Geometry logic lives here, out of
 * the React tree, so it is testable without a DOM — the builder's pointer
 * handlers call these and never mutate state directly.
 *
 * THE OVERFLOW LADDER is the load-bearing rule in this file. Spec §6 says
 * overflow creates a new page; spec §7 says a section never spans two pages.
 * Together those fix the behaviour: a section cannot split, so THE SECTION IS
 * WHAT MOVES, never the content. Every geometry mutation runs the same ladder,
 * in this order:
 *
 *   1. GROW IN PLACE while `section.y + section.height` stays inside the
 *      bottom margin.
 *   2. PUSH SIBLINGS down; a sibling pushed past the bottom margin is
 *      RELOCATED to the next page rather than left overhanging.
 *   3. RELOCATE THE WHOLE SECTION to the next page (inserting one AT THE
 *      BREAK POINT, so pages below shift down and keep their ids) when growth
 *      itself would cross the bottom margin.
 *   4. HARD STOP. A section that alone exceeds the usable page height has
 *      nowhere left to go under §7, so the operation is REFUSED outright —
 *      never silently clamped, never partially applied.
 *
 * Because rung 3 can both move a section AND insert a page, every operation
 * returns ONE result containing both changes, so the history layer records a
 * single undo entry (spec §21) rather than two the user has to press Ctrl+Z
 * twice to unwind.
 */

export interface ApplyResult {
  document: FormDocument;
  /** Non-null when the operation was REFUSED. `document` is then unchanged. */
  refusal: string | null;
}

const ok = (document: FormDocument): ApplyResult => ({ document, refusal: null });
const refuse = (document: FormDocument, refusal: string): ApplyResult => ({ document, refusal });

export const SECTION_TOO_TALL =
  'This section fills the page. Add another section, or move some fields into one.';

/** Vertical breathing room left between two boxes that would otherwise touch. */
const STACK_GAP = 8;
/** Breathing room left below the lowest element when a section grows to fit. */
const SECTION_GROW_PADDING = 16;

export const newId = (): string =>
  // crypto.randomUUID needs a secure context; jsdom and plain-HTTP previews
  // are not always one, and a builder that throws while adding a section is
  // worse than one with slightly less pretty ids.
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** The one definition of how tall a section may ever be. Migration
 *  (backend clampSectionToUsableHeight) derives from the same formula, so a
 *  section clipped on read and one clamped while editing agree exactly. */
export const usableHeight = (page: FormPage): number => usablePageHeight(page);
export const usableWidth = (page: FormPage): number => usablePageWidth(page);

const clampSize = (n: number): number => Math.min(MAX_SIZE_PX, Math.max(MIN_SIZE_PX, Math.round(n)));
const clampCoord = (n: number): number => Math.round(n);

const boxesOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/**
 * Keeps an element inside its section HORIZONTALLY only. Vertical overflow is
 * deliberately left alone — a field dragged past the section's bottom edge is
 * exactly what should make the section grow (rung 1), not get clipped or
 * pushed back.
 */
const clampElementToSection = <T extends { x: number; y: number; width: number; height: number }>(
  section: FormSection,
  box: T
): T => {
  const width = Math.min(box.width, section.width);
  const maxX = Math.max(0, section.width - width);
  return { ...box, x: Math.min(Math.max(0, box.x), maxX), y: Math.max(0, box.y), width };
};

/** Pushes elements that overlap `movedId` straight down — never sideways,
 *  never up — so a field dropped on a sibling shoves it out of the way. */
const resolveElementOverlaps = (section: FormSection, movedId: string): FormSection => {
  const moved = section.elements.find((e) => e.id === movedId);
  if (!moved) return section;

  const obstacles = [{ x: moved.x, y: moved.y, width: moved.width, height: moved.height }];
  const resolved = new Map<string, FormElement>();
  let changed = false;

  for (const e of section.elements.filter((x) => x.id !== movedId).sort((a, b) => a.y - b.y)) {
    const box = resolved.get(e.id) ?? e;
    const hits = obstacles.filter((o) => boxesOverlap(o, box));
    if (hits.length > 0) {
      const next = { ...box, y: Math.max(...hits.map((o) => o.y + o.height + STACK_GAP)) };
      resolved.set(e.id, next);
      obstacles.push({ x: next.x, y: next.y, width: next.width, height: next.height });
      changed = true;
    } else {
      obstacles.push({ x: box.x, y: box.y, width: box.width, height: box.height });
    }
  }

  if (!changed) return section;
  return { ...section, elements: section.elements.map((e) => resolved.get(e.id) ?? e) };
};

/** RUNG 1. A section never shrinks on its own, but grows to keep every
 *  element inside its own bottom edge instead of letting them spill past it. */
const growSectionToFit = (section: FormSection): FormSection => {
  const maxY = section.elements.reduce((m, e) => Math.max(m, e.y + e.height), 0);
  const height = Math.max(section.height, maxY + SECTION_GROW_PADDING);
  return height === section.height ? section : { ...section, height };
};

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export const findPage = (doc: FormDocument, pageId: string): DocumentPage | undefined =>
  doc.pages.find((p) => p.id === pageId);

export const findSection = (
  doc: FormDocument,
  sectionId: string
): { page: DocumentPage; section: FormSection; pageIndex: number } | undefined => {
  for (let i = 0; i < doc.pages.length; i += 1) {
    const section = doc.pages[i].sections.find((s) => s.id === sectionId);
    if (section) return { page: doc.pages[i], section, pageIndex: i };
  }
  return undefined;
};

export const pageContainingSection = (doc: FormDocument, sectionId: string): DocumentPage | undefined =>
  findSection(doc, sectionId)?.page;

export const sectionContaining = (doc: FormDocument, elementId: string): FormSection | undefined =>
  doc.pages
    .flatMap((p) => p.sections)
    .find((s) => s.elements.some((e) => e.id === elementId));

export const findElement = (doc: FormDocument, elementId: string): FormElement | undefined =>
  doc.pages
    .flatMap((p) => p.sections)
    .flatMap((s) => s.elements)
    .find((e) => e.id === elementId);

export const emptyDocument = (): FormDocument => ({
  version: 3,
  page: emptyPageGeometry(),
  pages: [{ id: newId(), sections: [] }],
});

// ---------------------------------------------------------------------------
// Page management (spec §6, §23). Ids are STABLE: insert/delete/reorder never
// renumber a surviving page, so submissions and revisions stay traceable.
// ---------------------------------------------------------------------------

const blankPage = (): DocumentPage => ({ id: newId(), sections: [] });

export const addPage = (doc: FormDocument): ApplyResult =>
  doc.pages.length >= MAX_PAGE_COUNT
    ? refuse(doc, `A form cannot have more than ${MAX_PAGE_COUNT} pages.`)
    : ok({ ...doc, pages: [...doc.pages, blankPage()] });

export const insertPageAt = (doc: FormDocument, index: number): ApplyResult => {
  if (doc.pages.length >= MAX_PAGE_COUNT) {
    return refuse(doc, `A form cannot have more than ${MAX_PAGE_COUNT} pages.`);
  }
  const at = Math.max(0, Math.min(index, doc.pages.length));
  const pages = [...doc.pages];
  pages.splice(at, 0, blankPage());
  return ok({ ...doc, pages });
};

export const deletePage = (doc: FormDocument, pageId: string): ApplyResult => {
  if (doc.pages.length <= 1) {
    return refuse(doc, 'A form needs at least one page.');
  }
  if (!findPage(doc, pageId)) return ok(doc);
  return ok({ ...doc, pages: doc.pages.filter((p) => p.id !== pageId) });
};

/** Deep copy with FRESH section and element ids: a duplicated page is new
 *  content, and reusing ids would break the uniqueness the validator enforces
 *  (and, for fields, silently alias two components onto one submission key). */
export const duplicatePage = (doc: FormDocument, pageId: string): ApplyResult => {
  const index = doc.pages.findIndex((p) => p.id === pageId);
  if (index < 0) return ok(doc);
  if (doc.pages.length >= MAX_PAGE_COUNT) {
    return refuse(doc, `A form cannot have more than ${MAX_PAGE_COUNT} pages.`);
  }

  const source = doc.pages[index];
  const copy: DocumentPage = {
    id: newId(),
    sections: source.sections.map((s) => ({
      ...s,
      id: newId(),
      elements: s.elements.map((e) => ({
        ...e,
        id: newId(),
        // A duplicated FIELD keeps its config and style but must NOT keep its
        // key — that is the data identity, and two components sharing one key
        // is silent data loss on submit (spec §11, §20). A fresh key is minted
        // by the caller that knows the whole document's key set; here it is
        // marked by suffixing, then normalised on save.
        field: e.field ? { ...e.field, key: `${e.field.key}_copy` } : undefined,
      })),
    })),
  };

  const pages = [...doc.pages];
  pages.splice(index + 1, 0, copy);
  return ok({ ...doc, pages });
};

export const reorderPage = (doc: FormDocument, pageId: string, toIndex: number): ApplyResult => {
  const from = doc.pages.findIndex((p) => p.id === pageId);
  if (from < 0) return ok(doc);
  const pages = [...doc.pages];
  const [moved] = pages.splice(from, 1);
  pages.splice(Math.max(0, Math.min(toIndex, pages.length)), 0, moved);
  return ok({ ...doc, pages });
};

/**
 * Explicit cleanup only. Pages left empty by an edit are deliberately NOT
 * auto-removed while editing — a page vanishing under the cursor mid-drag
 * fights the user — so this is wired to a "Remove empty pages" action in the
 * page rail instead.
 */
export const removeEmptyPages = (doc: FormDocument): ApplyResult => {
  const kept = doc.pages.filter((p) => p.sections.length > 0);
  return ok({ ...doc, pages: kept.length > 0 ? kept : [doc.pages[0]] });
};

// ---------------------------------------------------------------------------
// The overflow ladder
// ---------------------------------------------------------------------------

const fitsOnPage = (section: FormSection, page: FormPage): boolean =>
  section.height <= usableHeight(page);

const bottomLimit = (page: FormPage): number => page.height - page.margin.bottom;

/**
 * Rungs 2-4, applied to one page after a section on it changed geometry.
 *
 * Returns the settled pages plus any sections that could not stay on this
 * page and must cascade onto the next one. Never loses a section: anything
 * evicted comes back in `overflow` for the caller to place.
 */
const settlePage = (
  page: DocumentPage,
  geometry: FormPage,
  anchorId: string
): { page: DocumentPage; overflow: FormSection[] } => {
  const anchor = page.sections.find((s) => s.id === anchorId);
  if (!anchor) return { page, overflow: [] };

  const obstacles = [{ x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height }];
  const kept: FormSection[] = [anchor];
  const overflow: FormSection[] = [];

  for (const s of page.sections.filter((x) => x.id !== anchorId).sort((a, b) => a.y - b.y)) {
    let box = { ...s };
    const hits = obstacles.filter((o) => boxesOverlap(o, box));
    if (hits.length > 0) {
      // RUNG 2: push straight down.
      box = { ...box, y: Math.max(...hits.map((o) => o.y + o.height + STACK_GAP)) };
    }

    if (box.y + box.height > bottomLimit(geometry)) {
      // RUNG 2 (continued): a push that would overhang relocates instead.
      overflow.push({ ...box, y: geometry.margin.top });
    } else {
      kept.push(box);
      obstacles.push({ x: box.x, y: box.y, width: box.width, height: box.height });
    }
  }

  return { page: { ...page, sections: kept }, overflow };
};

/**
 * Places cascading sections onto the pages after `fromIndex`, inserting new
 * pages AT THE BREAK POINT as needed.
 *
 * Incoming sections go to the TOP of the target page and push whatever was
 * already there DOWN, rather than being appended below it. That is what keeps
 * document reading order intact: content that overflowed from page N precedes
 * the content already sitting on page N+1, so appending it underneath would
 * silently reorder the document. Anything the target page can no longer hold
 * cascades onward under the same rule.
 */
const cascade = (doc: FormDocument, fromIndex: number, incoming: FormSection[]): FormDocument => {
  if (incoming.length === 0) return doc;

  const top = doc.page.margin.top;
  let pages = [...doc.pages];
  let queue = [...incoming];
  let index = fromIndex + 1;

  while (queue.length > 0) {
    if (index >= pages.length) {
      if (pages.length >= MAX_PAGE_COUNT) break;
      pages = [...pages, blankPage()];
    }

    const target = pages[index];
    // Reading order: the arrivals first, then whatever already lived here.
    const ordered = [...queue, ...[...target.sections].sort((a, b) => a.y - b.y)];

    const placed: FormSection[] = [];
    const spilled: FormSection[] = [];
    let cursor = top;

    for (const s of ordered) {
      if (cursor + s.height <= bottomLimit(doc.page)) {
        placed.push({ ...s, y: cursor });
        cursor += s.height + STACK_GAP;
      } else {
        spilled.push(s);
      }
    }

    pages[index] = { ...target, sections: placed };
    queue = spilled;
    index += 1;
  }

  return { ...doc, pages };
};

/**
 * Runs the full ladder after `sectionId` changed geometry on `pageIndex`.
 * The single entry point every mutation funnels through, so there is exactly
 * one answer to "what happens at the page boundary".
 */
const settle = (doc: FormDocument, pageIndex: number, sectionId: string): ApplyResult => {
  const target = doc.pages[pageIndex];
  const section = target.sections.find((s) => s.id === sectionId);
  if (!section) return ok(doc);

  // RUNG 4: nowhere left to go under §7.
  if (!fitsOnPage(section, doc.page)) return refuse(doc, SECTION_TOO_TALL);

  let pages = [...doc.pages];
  let working: FormDocument = { ...doc, pages };

  // RUNG 3: the section itself crosses the bottom margin -> relocate whole.
  if (section.y + section.height > bottomLimit(doc.page)) {
    pages[pageIndex] = { ...target, sections: target.sections.filter((s) => s.id !== sectionId) };
    working = { ...working, pages };

    const nextIndex = pageIndex + 1;
    if (nextIndex >= working.pages.length) {
      const inserted = insertPageAt(working, nextIndex);
      if (inserted.refusal) return refuse(doc, inserted.refusal);
      working = inserted.document;
    }
    working = cascade(working, pageIndex, [{ ...section, y: doc.page.margin.top }]);
    return ok(working);
  }

  // RUNGS 1-2 on this page, cascading whatever no longer fits.
  const settled = settlePage(target, doc.page, sectionId);
  pages = [...working.pages];
  pages[pageIndex] = settled.page;
  working = { ...working, pages };

  if (settled.overflow.length > 0) {
    if (pageIndex + 1 >= working.pages.length) {
      const inserted = insertPageAt(working, pageIndex + 1);
      if (inserted.refusal) return refuse(doc, inserted.refusal);
      working = inserted.document;
    }
    working = cascade(working, pageIndex, settled.overflow);
  }

  return ok(working);
};

/**
 * Runs the ladder on a document that has already been mutated, reverting to
 * `original` if the ladder refuses. Rung 4 promises the rejected operation is
 * "never silently applied and never partially applied" — without this the
 * refusal would hand back the half-applied document it was called with.
 */
const settleOrRevert = (
  original: FormDocument,
  mutated: FormDocument,
  pageIndex: number,
  sectionId: string
): ApplyResult => {
  const result = settle(mutated, pageIndex, sectionId);
  return result.refusal ? refuse(original, result.refusal) : result;
};

/** Replaces one section on one page, then runs the ladder. */
const withSection = (
  doc: FormDocument,
  sectionId: string,
  fn: (section: FormSection) => FormSection
): ApplyResult => {
  const found = findSection(doc, sectionId);
  if (!found) return ok(doc);

  const next = fn(found.section);
  if (next === found.section) return ok(doc);

  const pages = [...doc.pages];
  pages[found.pageIndex] = {
    ...found.page,
    sections: found.page.sections.map((s) => (s.id === sectionId ? next : s)),
  };

  return settleOrRevert(doc, { ...doc, pages }, found.pageIndex, sectionId);
};

// ---------------------------------------------------------------------------
// Section operations
// ---------------------------------------------------------------------------

export const addSection = (
  doc: FormDocument,
  pageId: string,
  title: string,
  box: { x: number; y: number; width: number; height: number },
  /** Caller-chosen id, so a section created to hold free text can be
   *  recognised later (see `TEXT_HOST_PREFIX`). */
  id?: string
): ApplyResult => {
  const index = doc.pages.findIndex((p) => p.id === pageId);
  if (index < 0) return ok(doc);

  const section: FormSection = {
    id: id ?? newId(),
    title,
    x: clampCoord(box.x),
    y: clampCoord(box.y),
    width: Math.min(clampSize(box.width), usableWidth(doc.page)),
    height: clampSize(box.height),
    elements: [],
  };

  if (!fitsOnPage(section, doc.page)) return refuse(doc, SECTION_TOO_TALL);

  const pages = [...doc.pages];
  pages[index] = { ...doc.pages[index], sections: [...doc.pages[index].sections, section] };
  return settleOrRevert(doc, { ...doc, pages }, index, section.id);
};

/**
 * Dragging a section past the bottom margin drops it on the NEXT page;
 * dragging above the top margin drops it on the PREVIOUS one. Same code path
 * as rung 3, just pointer-driven rather than growth-driven — a section can
 * never be left overhanging a page boundary (spec §7).
 */
export const moveSection = (doc: FormDocument, sectionId: string, x: number, y: number): ApplyResult => {
  const found = findSection(doc, sectionId);
  if (!found) return ok(doc);

  const { pageIndex, page, section } = found;
  const nextY = clampCoord(y);

  if (nextY < 0 && pageIndex > 0) {
    return moveSectionToPage(doc, sectionId, doc.pages[pageIndex - 1].id, x, doc.page.margin.top);
  }

  if (nextY + section.height > bottomLimit(doc.page)) {
    let working = doc;
    if (pageIndex + 1 >= doc.pages.length) {
      const inserted = insertPageAt(doc, pageIndex + 1);
      if (inserted.refusal) return refuse(doc, inserted.refusal);
      working = inserted.document;
    }
    return moveSectionToPage(working, sectionId, working.pages[pageIndex + 1].id, x, working.page.margin.top);
  }

  const pages = [...doc.pages];
  pages[pageIndex] = {
    ...page,
    sections: page.sections.map((s) => (s.id === sectionId ? { ...s, x: clampCoord(x), y: nextY } : s)),
  };
  return settleOrRevert(doc, { ...doc, pages }, pageIndex, sectionId);
};

export const resizeSection = (
  doc: FormDocument,
  sectionId: string,
  box: { x: number; y: number; width: number; height: number }
): ApplyResult =>
  withSection(doc, sectionId, (section) => ({
    ...section,
    x: clampCoord(box.x),
    y: clampCoord(box.y),
    width: Math.min(clampSize(box.width), usableWidth(doc.page)),
    height: clampSize(box.height),
  }));

export const renameSection = (doc: FormDocument, sectionId: string, title: string): ApplyResult =>
  withSection(doc, sectionId, (section) => ({ ...section, title }));

export const updateSection = (
  doc: FormDocument,
  sectionId: string,
  changes: Partial<FormSection>
): ApplyResult => withSection(doc, sectionId, (section) => ({ ...section, ...changes }));

export const removeSection = (doc: FormDocument, sectionId: string): ApplyResult =>
  ok({
    ...doc,
    pages: doc.pages.map((p) => ({ ...p, sections: p.sections.filter((s) => s.id !== sectionId) })),
  });

/** Moves a whole section to another page, keeping its id and its elements'
 *  ids so submissions and revisions stay traceable (spec §6). */
export const moveSectionToPage = (
  doc: FormDocument,
  sectionId: string,
  targetPageId: string,
  x: number,
  y: number
): ApplyResult => {
  const found = findSection(doc, sectionId);
  const targetIndex = doc.pages.findIndex((p) => p.id === targetPageId);
  if (!found || targetIndex < 0 || found.page.id === targetPageId) return ok(doc);
  if (!fitsOnPage(found.section, doc.page)) return refuse(doc, SECTION_TOO_TALL);

  const moved: FormSection = { ...found.section, x: clampCoord(x), y: clampCoord(y) };

  const pages = doc.pages.map((p) => {
    if (p.id === found.page.id) return { ...p, sections: p.sections.filter((s) => s.id !== sectionId) };
    if (p.id === targetPageId) return { ...p, sections: [...p.sections, moved] };
    return p;
  });

  return settleOrRevert(doc, { ...doc, pages }, targetIndex, sectionId);
};

// ---------------------------------------------------------------------------
// Element operations — each grows its section (rung 1), then runs the ladder.
// ---------------------------------------------------------------------------

export const addElement = (doc: FormDocument, sectionId: string, element: FormElement): ApplyResult =>
  withSection(doc, sectionId, (section) => {
    const clamped = clampElementToSection(section, element);
    const withEl = { ...section, elements: [...section.elements, { ...element, ...clamped }] };
    return growSectionToFit(resolveElementOverlaps(withEl, element.id));
  });

export const moveElement = (doc: FormDocument, elementId: string, x: number, y: number): ApplyResult => {
  const section = sectionContaining(doc, elementId);
  if (!section) return ok(doc);

  return withSection(doc, section.id, (s) => {
    const element = s.elements.find((e) => e.id === elementId);
    if (!element) return s;
    const box = clampElementToSection(s, { ...element, x: clampCoord(x), y: clampCoord(y) });
    const withMove = {
      ...s,
      elements: s.elements.map((e) => (e.id === elementId ? ({ ...e, ...box } as FormElement) : e)),
    };
    return growSectionToFit(resolveElementOverlaps(withMove, elementId));
  });
};

export const resizeElement = (
  doc: FormDocument,
  elementId: string,
  box: { x: number; y: number; width: number; height: number }
): ApplyResult => {
  const section = sectionContaining(doc, elementId);
  if (!section) return ok(doc);

  return withSection(doc, section.id, (s) => {
    const clamped = clampElementToSection(s, {
      x: clampCoord(box.x),
      y: clampCoord(box.y),
      width: clampSize(box.width),
      height: clampSize(box.height),
    });
    const withResize = {
      ...s,
      elements: s.elements.map((e) => (e.id === elementId ? ({ ...e, ...clamped } as FormElement) : e)),
    };
    return growSectionToFit(resolveElementOverlaps(withResize, elementId));
  });
};

export const updateElement = (
  doc: FormDocument,
  elementId: string,
  changes: Partial<FormElement>
): ApplyResult =>
  ok({
    ...doc,
    pages: doc.pages.map((p) => ({
      ...p,
      sections: p.sections.map((s) => ({
        ...s,
        elements: s.elements.map((e) => (e.id === elementId ? ({ ...e, ...changes } as FormElement) : e)),
      })),
    })),
  });

export const removeElement = (doc: FormDocument, elementId: string): ApplyResult =>
  ok({
    ...doc,
    pages: doc.pages.map((p) => ({
      ...p,
      sections: p.sections.map((s) => ({
        ...s,
        elements: s.elements.filter((e) => e.id !== elementId),
      })),
    })),
  });

/** Moves an element into another section, in that section's local coords. */
export const moveElementToSection = (
  doc: FormDocument,
  elementId: string,
  targetSectionId: string,
  x: number,
  y: number
): ApplyResult => {
  const source = sectionContaining(doc, elementId);
  const element = findElement(doc, elementId);
  if (!source || !element || source.id === targetSectionId) return ok(doc);
  if (!findSection(doc, targetSectionId)) return ok(doc);

  const moved = { ...element, x: clampCoord(x), y: clampCoord(y) } as FormElement;

  const detached: FormDocument = {
    ...doc,
    pages: doc.pages.map((p) => ({
      ...p,
      sections: p.sections.map((s) =>
        s.id === source.id ? { ...s, elements: s.elements.filter((e) => e.id !== elementId) } : s
      ),
    })),
  };

  return withSection(detached, targetSectionId, (s) => {
    const clamped = clampElementToSection(s, moved);
    const withEl = { ...s, elements: [...s.elements, { ...moved, ...clamped }] };
    return growSectionToFit(resolveElementOverlaps(withEl, elementId));
  });
};

// ---------------------------------------------------------------------------
// Read-model artefacts
// ---------------------------------------------------------------------------

/**
 * Writes a batch of already-computed boxes back into the document.
 *
 * What align and distribute need: they produce geometry for several objects at
 * once, and the result has to reach the same overflow ladder every other
 * mutation goes through — otherwise an alignment could push a section past the
 * bottom margin without repaginating. Folding the batch through `moveElement`
 * / `moveSection` one at a time is what preserves that, and a refusal anywhere
 * discards the whole batch rather than leaving a half-aligned row.
 */
export const applyBoxes = (
  doc: FormDocument,
  kind: 'element' | 'section',
  boxes: { id: string; x: number; y: number }[]
): ApplyResult => {
  let working = doc;

  for (const box of boxes) {
    const exists =
      kind === 'element' ? !!findElement(working, box.id) : !!findSection(working, box.id);
    if (!exists) return ok(doc);

    const step =
      kind === 'element'
        ? moveElement(working, box.id, box.x, box.y)
        : moveSection(working, box.id, box.x, box.y);
    if (step.refusal) return refuse(doc, step.refusal);
    working = step.document;
  }

  return ok(working);
};

export const isSyntheticSection = (section: FormSection): boolean => section.id === UNPLACED_SECTION_ID;

/** Re-exported so canvas callers have one import for document helpers. */
export { TEXT_HOST_PREFIX, isTextHostSection };

/**
 * The rescue page is produced by the server on read so fields created outside
 * the builder stay reachable. It must never be saved back: persisting it
 * would turn it into a real page and the rescue would stop running from then
 * on.
 */
export const stripSyntheticPages = (doc: FormDocument): FormDocument => ({
  ...doc,
  pages: doc.pages
    .filter((p) => p.id !== UNPLACED_PAGE_ID)
    .map((p) => ({ ...p, sections: p.sections.filter((s) => !isSyntheticSection(s)) })),
});

/**
 * Brings a loaded document into line with the component/data-type pairings the
 * server will accept.
 *
 * THE SERVER REFUSES A PAIRING IT CANNOT RENDER — a BOOLEAN shown as a text
 * INPUT would take a string where a boolean belongs, and the mismatch would
 * surface as a failed submission in front of a customer rather than here. That
 * rule is right, and `PropertiesPanel` already honours it: changing a field's
 * type moves the control to a compatible one in the same edit.
 *
 * What nothing handled was a document that arrived ALREADY mismatched. Forms
 * seeded or migrated outside the builder carry pairings the validator now
 * rejects — "Client Intake" shipped with a BOOLEAN, a SINGLE_SELECT, a
 * USER_REFERENCE and a DATE all stored as INPUT. Every save of such a form
 * failed on the first mismatch, so autosave retried and failed forever and the
 * form could not be edited at all: not a validation message the owner could
 * act on, just a red banner over a document they never touched.
 *
 * Repairing on adoption is the only reading that makes the form usable, and it
 * is not a guess: for each data type there is exactly one sensible control and
 * `componentOptionsFor` already names it. The field, its key and its geometry
 * are untouched — only the control changes, and it changes to the one that can
 * actually hold the value.
 */
export const normaliseControls = (doc: FormDocument): FormDocument => ({
  ...doc,
  pages: doc.pages.map((page) => ({
    ...page,
    sections: page.sections.map((section) => ({
      ...section,
      elements: section.elements.map((element) => {
        if (!element.field) return element;
        const allowed = componentOptionsFor(element.field.dataType);
        if (allowed.length === 0 || allowed.includes(element.type)) return element;
        return { ...element, type: allowed[0] };
      }),
    })),
  })),
});

export { A4_PORTRAIT, DEFAULT_MARGIN };
