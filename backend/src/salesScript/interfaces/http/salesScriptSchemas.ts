import { z } from 'zod';

// Rich text is a TipTap document or pasted text; the sanitiser decides what
// survives (NFR-SEC-05), so the edge only bounds its size. Both languages are
// sent on every save: the editor saves the whole script.
const richText = z.union([z.string().max(100000), z.record(z.unknown())]).nullable();

export const salesScriptSchemas = {
  draft: z.object({ contentSq: richText, contentEn: richText }).strict(),
};
