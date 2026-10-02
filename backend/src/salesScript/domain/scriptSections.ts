import type { RichTextDoc, RichTextNode } from '../../shared/domain/richText';

/** The heading level that starts a section of the script (FR-SCR-03). */
export const SECTION_HEADING_LEVEL = 2;

export interface ScriptSection {
  /** `section-<n>`: the n-th section heading in the document, counting from 1. */
  anchor: string;
  title: string;
}

const textOf = (node: RichTextNode): string =>
  node.type === 'text'
    ? String(node.text ?? '')
    : Array.isArray(node.content)
      ? (node.content as RichTextNode[]).map(textOf).join('')
      : '';

/**
 * The section list the panel shows above the script (FR-SCR-03): every
 * top-level H2, in order. Anchors are by position, not by title, so two
 * sections with the same name, or names with ë and ç, still get distinct
 * plain ids. The frontend renderer numbers the H2s the same way. An empty
 * heading is counted but not listed.
 */
export function scriptSections(doc: RichTextDoc | null): ScriptSection[] {
  if (!doc) return [];
  const sections: ScriptSection[] = [];
  let index = 0;
  for (const node of doc.content) {
    if (node.type !== 'heading' || (node.attrs as { level?: unknown } | undefined)?.level !== SECTION_HEADING_LEVEL) continue;
    index += 1;
    const title = textOf(node).replace(/\s+/g, ' ').trim();
    if (title) sections.push({ anchor: `section-${index}`, title });
  }
  return sections;
}
