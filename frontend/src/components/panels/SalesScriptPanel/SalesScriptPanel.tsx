import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { SalesScriptContent } from '../../salesScript/SalesScriptContent';
import { salesScriptService, type PublishedScript, type ScriptLanguage } from '../../../services/salesScriptService';
import { useSalesScriptStore } from '../../../store/useSalesScriptStore';
import { usePermission } from '../../../hooks/usePermission';
import { drawerVariants } from '../../../lib/motion';
import styles from './SalesScriptPanel.module.css';

/** The script's languages are sq and en (FR-SCR-04); a reader in any other language gets English, then Albanian. */
const scriptLanguage = (language: string | undefined): ScriptLanguage => (language?.startsWith('sq') ? 'sq' : 'en');

/**
 * The sales script beside the page (M2 Slice 5: FR-SCR-02, 03, 08). Not a
 * dialog: no backdrop, no focus trap, no scroll lock, so the salesperson keeps
 * filling in the form underneath. On a phone it covers the screen, with a
 * close button.
 *
 * Mounted once, in TenantGuard, above the pages rather than in each page's
 * AppLayout, so moving between pages does not unmount it: it stays open, on
 * the same scroll position, until it is closed.
 */
export const SalesScriptPanel = () => {
  const { t, i18n } = useTranslation('common');
  const { tenantSlug } = useParams();
  const close = useSalesScriptStore((state) => state.close);
  const titleId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [script, setScript] = useState<PublishedScript | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const language = scriptLanguage(i18n.resolvedLanguage ?? i18n.language);

  // Fetched each time the panel opens (it mounts on open), so it always shows
  // the version published last (FR-SCR-04).
  useEffect(() => {
    if (!tenantSlug) return;
    let current = true;
    setFailed(false);
    salesScriptService
      .published(tenantSlug, language)
      .then((loaded) => current && setScript(loaded))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [tenantSlug, language]);

  // FR-SCR-08: count the marked matches and bring the first one into view.
  useEffect(() => {
    const marks = bodyRef.current?.querySelectorAll('mark') ?? [];
    setMatchCount(marks.length);
    if (query.trim()) marks[0]?.scrollIntoView?.({ block: 'center' });
  }, [query, script]);

  return (
    <motion.aside
      className={styles.panel}
      aria-labelledby={titleId}
      tabIndex={-1}
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={drawerVariants}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
      }}
      data-testid="sales-script-panel"
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {t('salesScript.title')}
        </h2>
        <button type="button" className={styles.closeButton} onClick={close} aria-label={t('salesScript.close')}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.search}>
        <Search size={16} className={styles.searchIcon} aria-hidden="true" />
        <input
          type="search"
          className={styles.searchInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('salesScript.searchPlaceholder')}
          aria-label={t('salesScript.search')}
        />
        {query.trim() && (
          <span className={styles.matchCount} role="status">
            {t('salesScript.matches', { count: matchCount })}
          </span>
        )}
      </div>

      <div ref={bodyRef} className={styles.body} data-testid="sales-script-body">
        {failed ? (
          <p className={styles.message} role="alert">
            {t('salesScript.loadFailed')}
          </p>
        ) : !script ? (
          <p className={styles.message}>{t('salesScript.loading')}</p>
        ) : (
          <SalesScriptContent content={script.content} sections={script.sections} idPrefix="sales-script" highlight={query} />
        )}
      </div>
    </motion.aside>
  );
};

/** Renders the panel while it is open, for a user who may read the script (FR-SCR-01). */
export const SalesScriptPanelHost = () => {
  const isOpen = useSalesScriptStore((state) => state.isOpen);
  const canView = usePermission('script.view');
  return <AnimatePresence>{isOpen && canView && <SalesScriptPanel key="sales-script" />}</AnimatePresence>;
};
