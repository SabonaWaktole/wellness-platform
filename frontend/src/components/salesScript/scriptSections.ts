import type { RichTextDoc } from '../../types/form';
import type { ScriptSection } from '../../services/salesScriptService';

type AnyNode = { type: string; attrs?: { level?: unknown }; content?: AnyNode[]; text?: string };

const textOf = (node: AnyNode): string => (node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(textOf).join(''));

/**
 * The section list for a script the server has not listed yet: the
 * Administrator's draft in the preview. Same rule as the server's
 * `scriptSections`: every top-level H2, numbered by position, an empty one
 * counted but not listed.
 */
export function scriptSections(doc: RichTextDoc | null): ScriptSection[] {
  const sections: ScriptSection[] = [];
  let index = 0;
  for (const node of (doc?.content ?? []) as AnyNode[]) {
    if (node.type !== 'heading' || node.attrs?.level !== 2) continue;
    index += 1;
    const title = textOf(node).replace(/\s+/g, ' ').trim();
    if (title) sections.push({ anchor: `section-${index}`, title });
  }
  return sections;
}
