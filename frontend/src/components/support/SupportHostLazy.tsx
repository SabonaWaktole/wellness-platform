import { lazy, Suspense } from 'react';
import { useAnnouncerStore } from '../../lib/support/announcer';
import { useSupportStore } from '../../store/useSupportStore';

const SupportHost = lazy(() => import('./SupportHost'));

/**
 * What the shells mount. A user who never opens Support pays for this gate and
 * nothing else: the host and everything behind it is a separate chunk that is
 * requested only once there is a session (or a closing message) to show.
 */
export const SupportHostLazy = () => {
  const inSession = useSupportStore((state) => state.mode !== 'none');
  const closing = useAnnouncerStore((state) => state.message !== '');
  if (!inSession && !closing) return null;
  return (
    <Suspense fallback={null}>
      <SupportHost />
    </Suspense>
  );
};
