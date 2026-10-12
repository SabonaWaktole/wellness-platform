import type { CSSProperties } from 'react';
import { useAnnouncerStore } from '../../lib/support/announcer';

const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/** A polite live region for tour progress ("Step 2 of 5: ..."), invisible and never in the way of the page. */
export const LiveAnnouncer = () => {
  const message = useAnnouncerStore((state) => state.message);
  return (
    <div role="status" aria-live="polite" aria-atomic="true" style={VISUALLY_HIDDEN}>
      {message}
    </div>
  );
};
