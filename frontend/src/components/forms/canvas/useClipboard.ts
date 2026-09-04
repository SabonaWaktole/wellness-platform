import { useCallback, useState } from 'react';
import { addElement, findSection, newId, removeElement, sectionContaining, type ApplyResult } from './layoutOps';
import { nextFieldKey } from './fieldKeys';
import type { FormDocument, FormElement } from '../../../types/form';

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

export interface Clipboard {
  hasContent: boolean;
  copy: (doc: FormDocument, elementIds: string[]) => void;
  cut: (doc: FormDocument, elementIds: string[]) => ApplyResult;
  paste: (doc: FormDocument, targetSectionId: string | null) => ApplyResult;
  /** Copy + paste in one step, without disturbing the clipboard. */
  duplicate: (doc: FormDocument, elementIds: string[]) => ApplyResult;
}

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
        ? // Minted against the working document so a batch paste cannot
          // collide with itself, not just with what was already there.
          { ...element.field, key: nextFieldKey(working, element.field.label) }
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

export const useClipboard = (): Clipboard => {
  const [buffer, setBuffer] = useState<FormElement[]>([]);

  const copy = useCallback((doc: FormDocument, elementIds: string[]) => {
    setBuffer(collect(doc, elementIds));
  }, []);

  const cut = useCallback((doc: FormDocument, elementIds: string[]): ApplyResult => {
    const elements = collect(doc, elementIds);
    setBuffer(elements);
    let working = doc;
    for (const element of elements) working = removeElement(working, element.id).document;
    return { document: working, refusal: null };
  }, []);

  const paste = useCallback(
    (doc: FormDocument, targetSectionId: string | null): ApplyResult => {
      if (buffer.length === 0 || !targetSectionId) return { document: doc, refusal: null };
      return pasteInto(doc, targetSectionId, buffer);
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

  return { hasContent: buffer.length > 0, copy, cut, paste, duplicate };
};
