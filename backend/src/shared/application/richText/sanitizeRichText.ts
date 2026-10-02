import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import { DomainError } from '../../domain/errors/DomainError';
import type { RichTextDoc, RichTextNode } from '../../domain/richText';

/**
 * Rich text a workspace writes once and shows to many: the offer texts (M2
 * Slice 4) and the sales script (Slice 5). Stored as TipTap JSON, never HTML
 * (M2 plan D10), and sanitised on the server before it is stored
 * (NFR-SEC-05). It is rendered structurally — `RichTextReadOnly` on the web,
 * the PDF walker on the offer — so nothing here is ever handed to a browser
 * as markup.
 *
 * The whitelist is deliberately narrower than the form TEXT component's
 * (`formSchemas.ts`): paragraphs, headings, lists, line breaks, bold, italic
 * and links. No colours, fonts or sizes; the offer's layout owns those.
 */

export type { RichTextDoc, RichTextNode };

/** The input is neither a document this whitelist accepts nor text. Mapped to 400 by the caller. */
export class InvalidRichTextError extends DomainError {
  readonly code = 'INVALID_RICH_TEXT';

  constructor() {
    super('This text contains formatting that is not allowed.');
  }
}

const MAX_DEPTH = 40;
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Only absolute http(s) and mailto links: no `javascript:`, `data:` or relative ones. */
export function isAllowedHref(href: unknown): href is string {
  if (typeof href !== 'string' || href.length > 2000 || href !== href.trim() || /[\s\p{Cc}]/u.test(href)) {
    return false;
  }
  try {
    return LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
}

const markSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }).strict(),
  z.object({ type: z.literal('italic') }).strict(),
  z
    .object({
      type: z.literal('link'),
      attrs: z.object({ href: z.string().refine(isAllowedHref) }).strict(),
    })
    .strict(),
]);

const nodeSchema = (depth: number): z.ZodType<RichTextNode> => {
  if (depth > MAX_DEPTH) {
    return z.never() as unknown as z.ZodType<RichTextNode>;
  }
  const child = z.lazy(() => nodeSchema(depth + 1));

  return z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), text: z.string().min(1).max(4000), marks: z.array(markSchema).max(10).optional() }).strict(),
    z.object({ type: z.literal('hardBreak') }).strict(),
    z.object({ type: z.literal('paragraph'), content: z.array(child).max(500).optional() }).strict(),
    z
      .object({
        type: z.literal('heading'),
        attrs: z.object({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict(),
        content: z.array(child).max(500).optional(),
      })
      .strict(),
    z.object({ type: z.literal('bulletList'), content: z.array(child).max(200).optional() }).strict(),
    z
      .object({
        type: z.literal('orderedList'),
        // TipTap always writes both; `type` is the list style, null for the default.
        attrs: z
          .object({ start: z.number().int().min(1).max(10000), type: z.string().max(10).nullable().optional() })
          .strict()
          .optional(),
        content: z.array(child).max(200).optional(),
      })
      .strict(),
    z.object({ type: z.literal('listItem'), content: z.array(child).max(50).optional() }).strict(),
  ]) as unknown as z.ZodType<RichTextNode>;
};

/** The stored shape. Exported for tests and for callers that only validate. */
export const documentTextSchema = z.object({
  type: z.literal('doc'),
  content: z.array(nodeSchema(0)).max(500),
});

/**
 * Removes every link whose href is not an allowed absolute link, keeping its
 * text, and reduces an allowed link to its href (TipTap also writes `target`,
 * `rel` and `class`, which the renderer sets itself). Everything else is left
 * for the schema to accept or refuse.
 */
function withSafeLinks(node: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH + 2 || node === null || typeof node !== 'object' || Array.isArray(node)) {
    return node;
  }
  const result: Record<string, unknown> = { ...(node as Record<string, unknown>) };
  if (Array.isArray(result.marks)) {
    result.marks = result.marks.flatMap((mark: unknown) => {
      const { type, attrs } = (mark ?? {}) as { type?: unknown; attrs?: { href?: unknown } };
      if (type !== 'link') return [mark];
      return isAllowedHref(attrs?.href) ? [{ type: 'link', attrs: { href: attrs!.href } }] : [];
    });
    if ((result.marks as unknown[]).length === 0) delete result.marks;
  }
  if (Array.isArray(result.content)) {
    result.content = result.content.map((child: unknown) => withSafeLinks(child, depth + 1));
  }
  return result;
}

/** Block-level closing tags and breaks, so text from separate blocks does not run together. */
const BLOCK_END = /<\s*(?:br\b[^>]*|\/\s*(?:p|div|li|h[1-6]|tr|ul|ol|blockquote|pre)\s*)>/gi;

const decodeEscapes = (text: string) =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/**
 * Pasted HTML or plain text, reduced to its text: `sanitize-html` with an
 * empty allow-list drops every tag and attribute, and the contents of
 * `<script>` and `<style>` with them. Each line becomes a paragraph.
 */
function documentFromText(input: string): RichTextDoc {
  const text = decodeEscapes(sanitizeHtml(input.replace(BLOCK_END, '$&\n'), { allowedTags: [], allowedAttributes: {} }));
  const paragraphs = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line.slice(0, 4000) }] }));
  return { type: 'doc', content: paragraphs };
}

/**
 * What to store for a rich-text field (NFR-SEC-05): a TipTap document is
 * checked against the whitelist after unsafe links are removed; a string is
 * treated as pasted HTML and reduced to its text. Returns `null` for empty
 * input. Throws `InvalidRichTextError` for anything else.
 */
export function sanitizeRichText(input: unknown): RichTextDoc | null {
  if (input === null || input === undefined) return null;

  const candidate = typeof input === 'string' ? documentFromText(input) : withSafeLinks(input);
  const parsed = documentTextSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new InvalidRichTextError();
  }
  const doc = parsed.data as RichTextDoc;
  return richTextPlainText(doc) ? doc : null;
}

/** The blocks that end a line of plain text. */
const BLOCKS = new Set(['paragraph', 'heading', 'listItem']);

/**
 * The document's text, one line per paragraph or heading, for the audit log
 * (which shows old and new values, FR-AUD-09) and for search. `null` for no
 * document; `''` for a document with no text.
 */
export function richTextPlainText(doc: RichTextDoc | null): string | null {
  if (!doc) return null;
  const lines: string[] = [];
  let line = '';
  const walk = (node: RichTextNode) => {
    if (node.type === 'text') line += String(node.text ?? '');
    if (node.type === 'hardBreak') line += ' ';
    const content = Array.isArray(node.content) ? (node.content as RichTextNode[]) : [];
    const isBlock = BLOCKS.has(node.type) && !content.some((child) => BLOCKS.has(child.type) || child.type.endsWith('List'));
    content.forEach(walk);
    if (isBlock) {
      if (line.trim()) lines.push(line.trim());
      line = '';
    }
  };
  doc.content.forEach(walk);
  if (line.trim()) lines.push(line.trim());
  return lines.join('\n');
}
