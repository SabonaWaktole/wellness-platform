/**
 * Rich text as stored: a TipTap JSON document (M2 plan D10), never HTML. The
 * whitelist and the sanitiser live in
 * `shared/application/richText/sanitizeRichText.ts`.
 */
export type RichTextNode = { type: string; [key: string]: unknown };

export interface RichTextDoc {
  type: 'doc';
  content: RichTextNode[];
}
