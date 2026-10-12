import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAnnouncerStore } from '../../lib/support/announcer';
import { describeTarget } from '../../lib/support/describeTarget';
import { useTourFocus } from '../../lib/support/useTourFocus';
import { useTourKeyboard } from '../../lib/support/useTourKeyboard';
import { useTourSession } from '../../lib/support/useTourSession';
import { useTargetRect } from '../../lib/support/useTargetRect';
import { useSupportStore } from '../../store/useSupportStore';
import { LiveAnnouncer } from './LiveAnnouncer';
import { SpotlightMask } from './SpotlightMask';
import { TourPopover } from './TourPopover';

/** One running tour: the spotlight, the card, and the focus, keyboard and screen reader behaviour around them. */
const TourSessionView = () => {
  const session = useTourSession();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const { variant, targetElement } = session;
  const shown = variant !== null;

  useTourFocus(shown, headingRef, session.stepKey);
  useTourKeyboard({
    running: shown,
    waiting: session.escapeToApp,
    onExit: variant === 'completed' ? session.onClose : session.onExit,
    onNext: session.onNext,
    onBack: session.onBack,
    popoverRef,
  });

  // The explanation is the highlighted control's description; it follows the control if it is replaced.
  useEffect(() => {
    const bodyId = popoverRef.current?.getAttribute('aria-describedby');
    if (!targetElement || !bodyId) return;
    return describeTarget(targetElement, bodyId);
  }, [targetElement, variant]);

  const rect = useTargetRect(targetElement);

  if (!shown) return null;
  return (
    <>
      <SpotlightMask element={targetElement} />
      {createPortal(
        <TourPopover
          variant={variant}
          copy={session.copy}
          index={session.index}
          total={session.total}
          status={session.status}
          targetRect={rect}
          onNext={session.onNext}
          onBack={session.onBack}
          onSkip={session.onSkip}
          onExit={session.onExit}
          onFinish={session.onFinish}
          onReplay={session.onReplay}
          onClose={session.onClose}
          waitingFor={session.waitingFor}
          onSkipPart={session.onSkipPart}
          note={session.note}
          notice={session.notice}
          lastLabel={session.lastLabel}
          rootRef={popoverRef}
          headingRef={headingRef}
          onSheetHeight={session.setSheetHeight}
        />,
        document.body,
      )}
    </>
  );
};

/**
 * The Support host, mounted once per shell. Renders nothing, and registers
 * nothing, until a session exists; the live region outlives the session just
 * long enough to say that the tour closed.
 */
export default function SupportHost() {
  const mode = useSupportStore((state) => state.mode);
  const message = useAnnouncerStore((state) => state.message);
  if (mode === 'none' && !message) return null;
  return (
    <>
      {mode === 'tour' && <TourSessionView />}
      <LiveAnnouncer />
    </>
  );
}
