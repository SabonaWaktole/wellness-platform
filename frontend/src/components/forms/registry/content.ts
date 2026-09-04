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
