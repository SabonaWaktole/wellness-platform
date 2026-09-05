import type { RichTextDoc } from '../../../types/form';

/** Pure helpers shared by the render components. Kept out of renderers.tsx so
 *  that file exports only components (React Fast Refresh requirement). */

export const plainTextOf = (doc: RichTextDoc | undefined): string => {
  if (!doc?.content) return '';
  const walk = (nodes: unknown[]): string =>
    nodes
      .map((n) => {
        const node = n as { text?: string; content?: unknown[] };
        if (typeof node.text === 'string') return node.text;
        return Array.isArray(node.content) ? walk(node.content) : '';
      })
      .join('');
  return walk(doc.content);
};

export const wrapText = (text: string): RichTextDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
});

export const formatValue = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

/**
 * Replaces empty-string node/mark attributes with `null` on the way into the
 * document model.
 *
 * TipTap registers `lineHeight`, `textAlign` and friends with `default: null`,
 * and the stored schema accepts either `null` or a real measure — but the
 * extension's own `parseHTML` reads the value straight off `element.style`,
 * where an unset property is `''`, not `null` (`??` does not catch an empty
 * string). A paragraph that has been through the DOM therefore serialises as
 * `lineHeight: ""`, which the document schema refuses:
 *
 *   String must contain at least 1 character(s)
 *   path: layout.pages.0.sections.0.elements.5.content.content.1.attrs.lineHeight
 *
 * The whole document then fails to save, so ONE press of Enter inside a text
 * block was enough to make a form unsavable — with the reason shown as a Zod
 * dump the owner has no way to act on. Normalising here, at the single point
 * where edited content enters the model, fixes it whatever produced the empty
 * string rather than chasing each extension's parse behaviour.
 */
export const normaliseRichText = <T>(node: T): T => {
  if (Array.isArray(node)) return node.map(normaliseRichText) as unknown as T;
  if (!node || typeof node !== 'object') return node;

  const source = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (key === 'attrs' && value && typeof value === 'object' && !Array.isArray(value)) {
      const attrs: Record<string, unknown> = {};
      for (const [attr, attrValue] of Object.entries(value as Record<string, unknown>)) {
        attrs[attr] = attrValue === '' ? null : attrValue;
      }
      result[key] = attrs;
    } else {
      result[key] = normaliseRichText(value);
    }
  }

  return result as unknown as T;
};
