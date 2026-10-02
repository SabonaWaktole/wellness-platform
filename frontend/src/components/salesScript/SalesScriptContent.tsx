import { useTranslation } from 'react-i18next';
import { RichTextReadOnly } from '../forms/registry/RichTextReadOnly';
import type { RichTextDoc } from '../../types/form';
import type { ScriptSection } from '../../services/salesScriptService';
import styles from './SalesScriptContent.module.css';

export interface SalesScriptContentProps {
  content: RichTextDoc;
  sections: ScriptSection[];
  /** Prefixes the section headings' ids, so the panel and a preview on the same page never share one. */
  idPrefix: string;
  /** Text to mark in the script (FR-SCR-08). */
  highlight?: string;
}

/**
 * The script as a salesperson reads it: the section list, then the text
 * (FR-SCR-03). Shared by the panel and the Administrator's preview, so the
 * preview is what salespeople will see (FR-SCR-04).
 */
export const SalesScriptContent = ({ content, sections, idPrefix, highlight }: SalesScriptContentProps) => {
  const { t } = useTranslation('common');
  const headingIdPrefix = `${idPrefix}-section-`;

  const goTo = (anchor: string) => {
    // The anchor is `section-<n>`; the heading's id carries the same number.
    document.getElementById(`${idPrefix}-${anchor}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={styles.script}>
      {sections.length > 0 && (
        <nav className={styles.sections} aria-label={t('salesScript.sections')}>
          <ol>
            {sections.map((section) => (
              <li key={section.anchor}>
                <button type="button" className={styles.sectionLink} onClick={() => goTo(section.anchor)}>
                  {section.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className={styles.text}>
        <RichTextReadOnly content={content} headingAnchorPrefix={headingIdPrefix} highlight={highlight} />
      </div>
    </div>
  );
};
