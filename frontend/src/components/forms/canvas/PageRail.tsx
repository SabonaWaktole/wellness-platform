import React from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import type { FormDocument } from '../../../types/form';
import styles from './PageRail.module.css';

export interface PageRailProps {
  layout: FormDocument;
  activePageId: string | null;
  onJumpToPage: (pageId: string) => void;
  onAddPage: () => void;
  onDeletePage: (pageId: string) => void;
  onDuplicatePage: (pageId: string) => void;
  onReorderPage: (pageId: string, toIndex: number) => void;
  onRemoveEmptyPages: () => void;
}

/**
 * Multi-page navigation and management (spec §23).
 *
 * Each entry is a miniature of the page's real section geometry rather than a
 * bare number — at a glance the owner can tell page 4 from page 5, which a
 * numbered list cannot do once a document has more than a couple of pages.
 *
 * "Remove empty pages" is an explicit action on purpose: pages left empty by
 * an edit are never auto-removed while editing, because a page vanishing
 * under the cursor mid-drag fights the user (see layoutOps.removeEmptyPages).
 */
export const PageRail: React.FC<PageRailProps> = ({
  layout,
  activePageId,
  onJumpToPage,
  onAddPage,
  onDeletePage,
  onDuplicatePage,
  onReorderPage,
  onRemoveEmptyPages,
}) => {
  const { t } = useTranslation('forms');
  const hasEmpty = layout.pages.some((p) => p.sections.length === 0);

  return (
    <aside className={styles.rail} aria-label={t('pageRail.label')}>
      <div className={styles.railHeader}>
        <span>{t('pageRail.pages', { count: layout.pages.length })}</span>
        <button type="button" onClick={onAddPage} aria-label={t('pageRail.addPage')} title={t('pageRail.addPage')}>
          <Plus size={14} />
        </button>
      </div>

      <ol className={styles.list}>
        {layout.pages.map((page, index) => (
          <li key={page.id}>
            <button
              type="button"
              className={`${styles.thumb} ${activePageId === page.id ? styles.thumbActive : ''}`}
              onClick={() => onJumpToPage(page.id)}
              aria-current={activePageId === page.id ? 'true' : undefined}
              aria-label={t('pageRail.goToPage', { number: index + 1 })}
            >
              <span className={styles.mini} aria-hidden="true">
                {page.sections.map((s) => (
                  <span
                    key={s.id}
                    className={styles.miniSection}
                    style={{
                      left: `${(s.x / layout.page.width) * 100}%`,
                      top: `${(s.y / layout.page.height) * 100}%`,
                      width: `${(s.width / layout.page.width) * 100}%`,
                      height: `${(s.height / layout.page.height) * 100}%`,
                    }}
                  />
                ))}
              </span>
              <span className={styles.thumbNumber}>{index + 1}</span>
            </button>

            <div className={styles.pageActions}>
              <button
                type="button"
                onClick={() => onReorderPage(page.id, index - 1)}
                disabled={index === 0}
                aria-label={t('pageRail.movePageUp', { number: index + 1 })}
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                onClick={() => onReorderPage(page.id, index + 1)}
                disabled={index === layout.pages.length - 1}
                aria-label={t('pageRail.movePageDown', { number: index + 1 })}
              >
                <ChevronDown size={12} />
              </button>
              <button
                type="button"
                onClick={() => onDuplicatePage(page.id)}
                aria-label={t('pageRail.duplicatePage', { number: index + 1 })}
              >
                <Copy size={12} />
              </button>
              <button
                type="button"
                onClick={() => onDeletePage(page.id)}
                disabled={layout.pages.length <= 1}
                aria-label={t('pageRail.deletePage', { number: index + 1 })}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </li>
        ))}
      </ol>

      {hasEmpty && (
        <button type="button" className={styles.cleanup} onClick={onRemoveEmptyPages}>
          {t('pageRail.removeEmptyPages')}
        </button>
      )}
    </aside>
  );
};
