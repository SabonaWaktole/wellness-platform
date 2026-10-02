const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Whether a link in rich text may be followed: an absolute http, https or
 * mailto address and nothing else, so no `javascript:` or `data:` URL ever
 * becomes an `href` (NFR-SEC-05). The server applies the same rule before it
 * stores the text (`sanitizeRichText.ts`); this is the second line, for
 * rendering and for the editor.
 */
export function isAllowedHref(href: unknown): boolean {
  if (typeof href !== 'string' || href.length > 2000 || href !== href.trim() || /[\s\p{Cc}]/u.test(href)) {
    return false;
  }
  try {
    return LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
}
