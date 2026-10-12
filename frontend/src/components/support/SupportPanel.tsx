import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Button } from '../ui/Button/Button';
import { loadGuide } from '../../lib/support/pageRegistry';
import { progressUserKey, readPageProgress, writeProgress } from '../../lib/support/progressStorage';
import { useEligibleSteps } from '../../lib/support/stepEligibility';
import { loadSupportCopy } from '../../lib/support/supportCopy';
import type { PageGuide } from '../../lib/support/types';
import { useSupportPage } from '../../lib/support/useSupportPage';
import { useAuthStore } from '../../store/useAuthStore';
import { useSupportStore } from '../../store/useSupportStore';
import styles from './SupportPanel.module.css';

type Load = { status: 'loading' } | { status: 'ready'; guide: PageGuide | null } | { status: 'error' };

/** "followUps" -> "Follow ups", "clients.list" -> "Clients list". Pages replace this with a real title under `pages.<pageId>`. */
const humanise = (value: string) => {
  const words = value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

interface SupportPanelProps {
  launcherRef: RefObject<HTMLElement | null>;
}

/**
 * The contextual help panel: what Support can do on the page the user is on.
 * Anchored under the header (a bottom sheet on a phone), portalled to the body
 * because the header's backdrop filter would otherwise capture `position: fixed`.
 */
export default function SupportPanel({ launcherRef }: SupportPanelProps) {
  const { t } = useTranslation('support');
  const { t: tCommon } = useTranslation('common');
  const { pathname } = useLocation();
  const page = useSupportPage();
  const user = useAuthStore((state) => state.user);
  const userKey = user ? progressUserKey(user) : 'anonymous';
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const { pageId, hasGuide, scope } = page;

  // Focus goes back to the launcher once the panel is gone, not before: a render still in flight would
  // otherwise pull it into a panel that is about to unmount.
  const returnFocus = useRef(false);
  useEffect(
    () => () => {
      if (returnFocus.current) launcherRef.current?.focus();
    },
    [launcherRef],
  );
  const close = useCallback((restoreFocus: boolean) => {
    returnFocus.current = restoreFocus;
    useSupportStore.getState().closePanel();
  }, []);

  // A panel belongs to the URL it was opened on. A new page mounts its own header, so a panel left open
  // would reappear there; it closes itself instead, and so does one that sees the URL change under it.
  useEffect(() => {
    const { panelPath, setPanelPath } = useSupportStore.getState();
    if (panelPath === null) setPanelPath(pathname);
    else if (panelPath !== pathname) close(false);
  }, [pathname, close]);

  // Fetch the Support copy and (when the page has one) its guide, on first open.
  useEffect(() => {
    let cancelled = false;
    setLoad({ status: 'loading' });
    Promise.all([loadSupportCopy('support'), pageId && hasGuide ? loadGuide(pageId) : null])
      .then(([, guide]) => {
        if (!cancelled) setLoad({ status: 'ready', guide });
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, hasGuide, attempt]);

  const guide = load.status === 'ready' ? load.guide : null;
  const eligible = useEligibleSteps(guide);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && !panelRef.current?.contains(target) && !launcherRef.current?.contains(target)) close(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [close, launcherRef]);

  // Focus follows the content: the panel while it loads, its heading once it has something to say.
  useEffect(() => {
    if (load.status === 'loading') panelRef.current?.focus({ preventScroll: true });
    else headingRef.current?.focus({ preventScroll: true });
  }, [load.status]);

  const loading = load.status === 'loading';
  const pageName = pageId ? t(`pages.${pageId}`, { defaultValue: humanise(pageId) }) : '';
  const pageLabel = scope ? `${pageName} · ${humanise(scope)}` : pageName;

  const topLevel = eligible.filter((step) => !step.group);
  const saved = guide && pageId ? readPageProgress(userKey, pageId, guide.version) : null;
  const resumeIndex = saved?.lastStepId ? topLevel.findIndex((step) => step.id === saved.lastStepId) : -1;
  const canTour = !!pageId && !!guide && topLevel.length > 0;

  const startTour = (fromTheTop: boolean) => {
    if (!pageId || !guide) return;
    if (fromTheTop) writeProgress(userKey, pageId, { v: guide.version, ...(saved?.completedAt ? { completedAt: saved.completedAt } : {}) });
    useSupportStore.getState().startTour(pageId);
  };

  let body;
  if (loading) {
    body = <div className={styles.skeleton} aria-hidden="true" />;
  } else if (load.status === 'error') {
    body = (
      <>
        <h2 id={titleId} className={styles.title} tabIndex={-1} ref={headingRef}>
          {t('panel.error')}
        </h2>
        <div className={styles.actions}>
          <Button type="button" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            {t('panel.retry')}
          </Button>
        </div>
      </>
    );
  } else if (!canTour) {
    body = (
      <>
        <h2 id={titleId} className={styles.title} tabIndex={-1} ref={headingRef}>
          {pageId ? t('panel.noHelpTitle', { page: pageLabel }) : t('panel.noPage')}
        </h2>
        {pageId && <p className={styles.text}>{t('panel.noHelpBody')}</p>}
      </>
    );
  } else {
    const startLabel = scope ? t('panel.tourTab') : t('panel.tourPage');
    body = (
      <>
        <h2 id={titleId} className={styles.title} tabIndex={-1} ref={headingRef}>
          {t('panel.title', { page: pageLabel })}
        </h2>
        {saved?.completedAt && (
          <p className={styles.done}>
            <Check size={16} aria-hidden="true" />
            {t('panel.completed')}
          </p>
        )}
        <div className={styles.actions}>
          {resumeIndex >= 0 ? (
            <>
              <Button type="button" size="sm" onClick={() => startTour(false)}>
                {t('panel.resume', { current: resumeIndex + 1, total: topLevel.length })}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => startTour(true)}>
                {t('panel.startOver')}
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={() => startTour(true)}>
              {saved?.completedAt ? t('panel.replay') : startLabel}
            </Button>
          )}
        </div>
      </>
    );
  }

  return createPortal(
    <div
      ref={panelRef}
      className={styles.panel}
      data-support-ui=""
      role="dialog"
      tabIndex={-1}
      aria-modal="false"
      aria-busy={loading}
      {...(loading ? { 'aria-label': tCommon('header.help') } : { 'aria-labelledby': titleId })}
    >
      {body}
      {!loading && (
        <div className={styles.footer}>
          <Button type="button" size="sm" variant="ghost" onClick={() => close(true)}>
            {t('panel.close')}
          </Button>
        </div>
      )}
    </div>,
    document.body,
  );
}
