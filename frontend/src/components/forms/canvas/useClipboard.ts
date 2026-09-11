import { useCallback, useState } from 'react';
import {
  addElement,
  addSection,
  findSection,
  newId,
  pageContainingSection,
  removeElement,
  removeSection,
  sectionContaining,
  type ApplyResult,
} from './layoutOps';
import { nextFieldKey } from './fieldKeys';
import type { FormDocument, FormElement, FormSection } from '../../../types/form';

/**
 * Copy / cut / paste / duplicate for canvas elements (spec §20).
 *
 * An in-app clipboard, deliberately not the system one: the payload is a
 * structured `FormElement[]`, and round-tripping that through
 * `navigator.clipboard` as text would either lose the field configuration or
 * invite arbitrary JSON from outside the app into the document.
 *
 * THE RULE THAT MATTERS: a pasted element gets a new visual identity (`id`)
 * AND a new data identity (`field.key`). Copying the key too would put two
 * components on one submission key — both render, both get filled, and
 * whichever serialises last silently wins (§11, §20). Everything else —
 * styling, dimensions, validation, options, relative position — is preserved.
 */

/** Offset applied to a paste so it never lands exactly on the original. */
export const PASTE_OFFSET = 16;

/** What the clipboard is holding, so a caller can tell what a paste NEEDS. */
export type ClipboardKind = 'none' | 'elements' | 'sections';

export interface Clipboard {
  hasContent: boolean;
  /**
   * Elements land in a SECTION; sections land on a PAGE. A Paste control that
   * only asks `hasContent` is wrong in both directions — it offers a paste
   * that will silently do nothing when elements are held and no section is
   * selected, and withholds one that would have worked when sections are.
   */
  kind: ClipboardKind;
  copy: (doc: FormDocument, elementIds: string[]) => void;
  cut: (doc: FormDocument, elementIds: string[]) => ApplyResult;
  /**
   * Pastes whatever is held, into the section or the page as appropriate for
   * what that is. One verb, because Ctrl+V is one key and the user should not
   * have to know which kind of thing they copied.
   */
  paste: (doc: FormDocument, targetSectionId: string | null, targetPageId?: string | null) => ApplyResult;
  /** Copy + paste in one step, without disturbing the clipboard. */
  duplicate: (doc: FormDocument, elementIds: string[]) => ApplyResult;
  copySections: (doc: FormDocument, sectionIds: string[]) => void;
  cutSections: (doc: FormDocument, sectionIds: string[]) => ApplyResult;
  duplicateSections: (doc: FormDocument, sectionIds: string[]) => ApplyResult;
}

/**
 * What the clipboard is holding. A tagged union rather than two buffers: with
 * two, a paste after copying a section and then a field has to guess which one
 * the user meant, and "most recently copied wins" is a rule nobody can see.
 */
type Buffer =
  | { kind: 'none' }
  | { kind: 'elements'; items: FormElement[] }
  | { kind: 'sections'; items: FormSection[] };

const collect = (doc: FormDocument, elementIds: string[]): FormElement[] => {
  const wanted = new Set(elementIds);
  return doc.pages
    .flatMap((p) => p.sections)
    .flatMap((s) => s.elements)
    .filter((e) => wanted.has(e.id));
};

/**
 * Places a batch into one section, preserving RELATIVE geometry: the batch's
 * own bounding box is offset as a unit rather than each element being offset
 * from wherever it happened to sit, so a carefully aligned group pastes still
 * aligned.
 */
const pasteInto = (
  doc: FormDocument,
  targetSectionId: string,
  elements: FormElement[]
): ApplyResult => {
  if (elements.length === 0) return { document: doc, refusal: null };
  if (!findSection(doc, targetSectionId)) return { document: doc, refusal: null };

  const originX = Math.min(...elements.map((e) => e.x));
  const originY = Math.min(...elements.map((e) => e.y));

  let working = doc;
  for (const element of elements) {
    const copy: FormElement = {
      ...element,
      id: newId(),
      x: originX + PASTE_OFFSET + (element.x - originX),
      y: originY + PASTE_OFFSET + (element.y - originY),
      field: element.field
        ? {
            ...element.field,
            // Minted against the working document so a batch paste cannot
            // collide with itself, not just with what was already there.
            key: nextFieldKey(working, element.field.label),
            /*
             * AND THE BINDING DOES NOT COME WITH IT.
             *
             * `clientFieldId` ties a field to a column on the client record,
             * and the server refuses a document that binds one column twice —
             * rightly, since a submission could not say which of the two won.
             * The copy kept it, so duplicating any bound field produced a
             * document that could never be saved again: every autosave from
             * that moment on returned 400 with "\"Phone\" is bound to more
             * than one field on this form", and the owner had to find and
             * unbind the copy themselves.
             *
             * A copy is a new field on the form. The original keeps the
             * binding it was given; the copy is unbound until someone says
             * otherwise, which is the same thing `key` already does.
             */
            clientFieldId: undefined,
          }
        : undefined,
    };

    const result = addElement(working, targetSectionId, copy);
    // A refusal (rung 4 of the overflow ladder) aborts the whole paste rather
    // than leaving half a batch on the canvas.
    if (result.refusal) return { document: doc, refusal: result.refusal };
    working = result.document;
  }

  return { document: working, refusal: null };
};

const sectionIdsOf = (doc: FormDocument): string[] =>
  doc.pages.flatMap((p) => p.sections).map((s) => s.id);

const collectSections = (doc: FormDocument, sectionIds: string[]): FormSection[] => {
  const wanted = new Set(sectionIds);
  return doc.pages.flatMap((p) => p.sections).filter((s) => wanted.has(s.id));
};

/**
 * Places whole sections onto a page, offset so a copy never lands exactly on
 * its original.
 *
 * Every id is minted fresh — the section's, each element's, and each field's
 * key — for the same reason a pasted element gets a new key: two components
 * sharing one submission key both render, both get filled, and whichever
 * serialises last silently wins. A refusal from the overflow ladder aborts the
 * whole paste rather than leaving half a section on the page.
 */
const pasteSectionsOnto = (
  doc: FormDocument,
  pageId: string,
  sections: FormSection[]
): ApplyResult => {
  let working = doc;

  for (const section of sections) {
    // `addSection` mints the id internally and returns only the document, so
    // the new section is identified by diffing against the ids that existed
    // immediately before this call — not against the original `doc`, which
    // would also match sections added by an earlier turn of this loop.
    const before = new Set(sectionIdsOf(working));
    const added = addSection(working, pageId, section.title ?? '', {
      x: section.x + PASTE_OFFSET,
      y: section.y + PASTE_OFFSET,
      width: section.width,
      height: section.height,
    });
    if (added.refusal) return { document: doc, refusal: added.refusal };
    working = added.document;

    const targetId = sectionIdsOf(working).find((id) => !before.has(id));
    if (!targetId) return { document: doc, refusal: null };

    for (const element of section.elements) {
      const copied: FormElement = {
        ...element,
        id: newId(),
        field: element.field
          ? {
              ...element.field,
              key: nextFieldKey(working, element.field.label),
              // Same reason as the element paste above: one client column,
              // one field.
              clientFieldId: undefined,
            }
          : undefined,
      };
      const placed = addElement(working, targetId, copied);
      if (placed.refusal) return { document: doc, refusal: placed.refusal };
      working = placed.document;
    }
  }

  return { document: working, refusal: null };
};

export const useClipboard = (): Clipboard => {
  const [buffer, setBuffer] = useState<Buffer>({ kind: 'none' });

  const copy = useCallback((doc: FormDocument, elementIds: string[]) => {
    setBuffer({ kind: 'elements', items: collect(doc, elementIds) });
  }, []);

  const cut = useCallback((doc: FormDocument, elementIds: string[]): ApplyResult => {
    const elements = collect(doc, elementIds);
    setBuffer({ kind: 'elements', items: elements });
    let working = doc;
    for (const element of elements) working = removeElement(working, element.id).document;
    return { document: working, refusal: null };
  }, []);

  const copySections = useCallback((doc: FormDocument, sectionIds: string[]) => {
    setBuffer({ kind: 'sections', items: collectSections(doc, sectionIds) });
  }, []);

  const cutSections = useCallback((doc: FormDocument, sectionIds: string[]): ApplyResult => {
    const sections = collectSections(doc, sectionIds);
    setBuffer({ kind: 'sections', items: sections });
    let working = doc;
    for (const section of sections) working = removeSection(working, section.id).document;
    return { document: working, refusal: null };
  }, []);

  const duplicateSections = useCallback((doc: FormDocument, sectionIds: string[]): ApplyResult => {
    const sections = collectSections(doc, sectionIds);
    if (sections.length === 0) return { document: doc, refusal: null };
    const pageId = pageContainingSection(doc, sections[0].id)?.id;
    if (!pageId) return { document: doc, refusal: null };
    return pasteSectionsOnto(doc, pageId, sections);
  }, []);

  const paste = useCallback(
    (doc: FormDocument, targetSectionId: string | null, targetPageId?: string | null): ApplyResult => {
      if (buffer.kind === 'elements') {
        if (!targetSectionId) return { document: doc, refusal: null };
        return pasteInto(doc, targetSectionId, buffer.items);
      }
      if (buffer.kind === 'sections') {
        // A section lands on a page. Falling back to the page the target
        // section lives on means Ctrl+V works with a field selected, rather
        // than silently doing nothing because the "wrong" thing was selected.
        const pageId =
          targetPageId ??
          (targetSectionId ? pageContainingSection(doc, targetSectionId)?.id : undefined) ??
          doc.pages[0]?.id;
        if (!pageId) return { document: doc, refusal: null };
        return pasteSectionsOnto(doc, pageId, buffer.items);
      }
      return { document: doc, refusal: null };
    },
    [buffer]
  );

  const duplicate = useCallback((doc: FormDocument, elementIds: string[]): ApplyResult => {
    const elements = collect(doc, elementIds);
    if (elements.length === 0) return { document: doc, refusal: null };
    // Duplicate in place: the source section, not wherever the clipboard was
    // last pasted, and without touching the clipboard itself.
    const sectionId = sectionContaining(doc, elements[0].id)?.id;
    if (!sectionId) return { document: doc, refusal: null };
    return pasteInto(doc, sectionId, elements);
  }, []);

  return {
    hasContent: buffer.kind !== 'none',
    kind: buffer.kind,
    copy,
    cut,
    paste,
    duplicate,
    copySections,
    cutSections,
    duplicateSections,
  };
};
