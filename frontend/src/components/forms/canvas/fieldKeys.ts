import type { FormDocument } from '../../../types/form';

/**
 * Mints a field key that is unique across the WHOLE document.
 *
 * Mirrors the backend's FieldKeyGenerator (FormDocument.ts) deliberately: the
 * server refuses a save whose keys collide, so producing one here would turn
 * a routine "add a field" into a rejected save with a message about a key the
 * owner never typed.
 *
 * The key is the durable DATA identity — submissions are stored as
 * `{ [key]: value }` — so it is minted once from the label and never rewritten
 * when that label is later edited (spec §11).
 */
export const slugifyKey = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

export const existingFieldKeys = (doc: FormDocument): Set<string> =>
  new Set(
    doc.pages
      .flatMap((p) => p.sections)
      .flatMap((s) => s.elements)
      .map((e) => e.field?.key)
      .filter((k): k is string => Boolean(k))
  );

export const nextFieldKey = (doc: FormDocument, label: string): string => {
  const used = existingFieldKeys(doc);
  const base = slugifyKey(label) || 'field';
  if (!used.has(base)) return base;

  let n = 2;
  while (used.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
};
