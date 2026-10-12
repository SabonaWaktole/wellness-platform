/**
 * One shared MutationObserver for everything in Support that has to notice the
 * page changing (target lookups, open layers, explainable controls).
 *
 * Nothing is created at import. The observer starts with the first subscriber
 * and disconnects with the last, and notifications are batched so a burst of
 * mutations produces one callback per subscriber per animation frame.
 */

const WATCHED_ATTRIBUTES = ['data-tour', 'disabled', 'aria-disabled', 'aria-hidden', 'aria-busy', 'hidden', 'class'];

interface Entry {
  notify: () => void;
}

const entries = new Set<Entry>();
let observer: MutationObserver | null = null;
let frame: number | null = null;

const flush = () => {
  frame = null;
  for (const entry of [...entries]) {
    try {
      entry.notify();
    } catch (error) {
      console.error('Support DOM subscriber failed', error);
    }
  }
};

const schedule = () => {
  if (frame === null) frame = requestAnimationFrame(flush);
};

export function subscribeToDom(notify: () => void): () => void {
  const entry: Entry = { notify };
  entries.add(entry);
  if (!observer) {
    observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: WATCHED_ATTRIBUTES,
    });
  }
  return () => {
    entries.delete(entry);
    if (entries.size === 0 && observer) {
      observer.disconnect();
      observer = null;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    }
  };
}

export const subscriberCount = () => entries.size;
