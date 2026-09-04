import { useEffect, useRef, useState } from 'react';

/**
 * Tracks which pages of a multi-page document are within (or near) the
 * viewport, so `FormCanvas` can skip rendering the expensive content of
 * pages that are far off-screen (spec §35). A tenant-authored document can
 * reach 10+ A4 pages and 300+ components; mounting every page's
 * `FormPageRenderer` plus the builder's own selection/drag chrome for all of
 * them at once is real, measurable render cost for sheets nobody can see.
 *
 * `rootMargin` gives a buffer so a page finishes rendering just BEFORE it
 * scrolls into view rather than the instant it crosses the viewport edge —
 * a fast scroll would otherwise show a visible pop-in.
 *
 * Deliberately keyed by page id, not index: reordering pages must not
 * thrash which DOM nodes are considered "the same" page mid-scroll.
 *
 * Every page starts VISIBLE and the observer narrows the set down, rather
 * than starting empty and waiting to be told a page is in view. A real
 * browser's IntersectionObserver fires its first callback within a frame or
 * two of `.observe()`, so this only means a large document's off-screen
 * pages stay mounted for one extra frame before virtualising — the
 * alternative (start empty) would mean the very first paint is blank until
 * that same callback arrives, which is a worse trade for a document that
 * fits on one screen (the overwhelmingly common case) to make for the rare
 * 10-page one.
 */
export const useVisiblePages = (pageIds: string[]) => {
  const [visible, setVisible] = useState<Set<string>>(() => new Set(pageIds));
  const elements = useRef<Map<string, HTMLElement>>(new Map());
  const idsKey = pageIds.join(',');

  useEffect(() => {
    // A page added after mount (Add page, undo of a delete…) is unknown to
    // the observer until its first callback — default it to visible too,
    // the same "innocent until narrowed" rule the initial state uses.
    setVisible((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of pageIds) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).dataset.pageId;
            if (!id) continue;
            if (entry.isIntersecting) next.add(id);
            else next.delete(id);
          }
          return next;
        });
      },
      { rootMargin: '800px 0px' }
    );

    for (const el of elements.current.values()) observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const setPageRef = (id: string) => (el: HTMLElement | null) => {
    if (el) elements.current.set(id, el);
    else elements.current.delete(id);
  };

  return {
    isVisible: (id: string) => visible.has(id),
    setPageRef,
  };
};
