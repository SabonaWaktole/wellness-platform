import { lazy, Suspense, useRef } from 'react';
import { HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSupportStore } from '../../store/useSupportStore';

// The panel and its copy are fetched when it is first opened, not with every page.
const SupportPanel = lazy(() => import('./SupportPanel'));

interface SupportLauncherProps {
  /** The header's icon button classes, so the launcher lays out exactly as the dead button it replaces did. */
  className?: string;
}

/** The header's Help button: opens the Support panel for the page the user is on. */
export const SupportLauncher = ({ className }: SupportLauncherProps) => {
  const { t } = useTranslation('common');
  const panelOpen = useSupportStore((state) => state.panelOpen);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const toggle = () => {
    const { panelOpen: open, openPanel, closePanel } = useSupportStore.getState();
    if (open) closePanel();
    else openPanel();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className}
        aria-label={t('header.help')}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        onClick={toggle}
      >
        <HelpCircle size={20} />
      </button>
      {panelOpen && (
        <Suspense fallback={null}>
          <SupportPanel launcherRef={buttonRef} />
        </Suspense>
      )}
    </>
  );
};
