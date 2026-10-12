/**
 * Makes the tour's explanation the highlighted control's description for
 * screen readers, without clobbering a description it already has. The
 * returned cleanup restores the exact previous attribute value (or removes the
 * attribute if there was none), and works once.
 */
export function describeTarget(element: Element, bodyId: string): () => void {
  const previous = element.getAttribute('aria-describedby');
  const tokens = (previous ?? '').split(/\s+/).filter(Boolean);
  if (!tokens.includes(bodyId)) element.setAttribute('aria-describedby', [...tokens, bodyId].join(' '));

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    if (previous === null) element.removeAttribute('aria-describedby');
    else element.setAttribute('aria-describedby', previous);
  };
}
