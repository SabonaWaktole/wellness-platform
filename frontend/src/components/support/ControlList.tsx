import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button/Button';
import type { ExplainableEntry } from '../../lib/support/useExplainableControls';
import type { GuideStep } from '../../lib/support/types';
import styles from './ControlList.module.css';

interface ControlListProps {
  entries: ExplainableEntry[];
  loading: boolean;
  /** The control's name as the user reads it. */
  titleOf: (step: GuideStep) => string;
  onChoose: (step: GuideStep) => void;
  onBack: () => void;
  onRetry: () => void;
}

/**
 * The controls on this page that can be explained right now: a search box over
 * a listbox, driven from the search box with the arrow keys (the combobox
 * pattern), so a keyboard user never leaves the field they are typing in.
 */
export const ControlList = ({ entries, loading, titleOf, onChoose, onBack, onRetry }: ControlListProps) => {
  const { t } = useTranslation('support');
  const baseId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => inputRef.current?.focus({ preventScroll: true }), []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.map((entry) => ({ entry, title: titleOf(entry.step) })).filter(({ title }) => title.toLowerCase().includes(needle));
  }, [entries, query, titleOf]);

  // The highlight always sits on a real option, however the list changes under it.
  const current = Math.min(active, Math.max(0, visible.length - 1));
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const sections = useMemo(() => {
    const order: string[] = [];
    for (const { entry } of visible) if (!order.includes(entry.section)) order.push(entry.section);
    return order;
  }, [visible]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (visible.length === 0) return;
    const move = (to: number) => {
      event.preventDefault();
      setActive(Math.max(0, Math.min(visible.length - 1, to)));
    };
    if (event.key === 'ArrowDown') move(current + 1);
    else if (event.key === 'ArrowUp') move(current - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(visible.length - 1);
    else if (event.key === 'Enter') {
      event.preventDefault();
      onChoose(visible[current].entry.step);
    }
  };

  const empty = !loading && entries.length === 0;

  return (
    <div className={styles.list}>
      <div className={styles.header}>
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          {t('panel.back')}
        </Button>
        <h2 className={styles.title}>{t('controls.title')}</h2>
      </div>

      <input
        ref={inputRef}
        type="search"
        className={styles.search}
        aria-label={t('controls.search')}
        aria-controls={`${baseId}-listbox`}
        aria-activedescendant={visible.length > 0 ? optionId(current) : undefined}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />

      {loading && <p className={styles.note}>{t('controls.loading')}</p>}
      {empty && (
        <div className={styles.empty}>
          <p className={styles.note}>{t('controls.empty')}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            {t('controls.retry')}
          </Button>
        </div>
      )}
      {!loading && !empty && visible.length === 0 && <p className={styles.note}>{t('controls.noMatch', { query: query.trim() })}</p>}

      <div id={`${baseId}-listbox`} role="listbox" aria-busy={loading} aria-label={t('controls.title')} className={styles.options}>
        {sections.map((section) => {
          const rows = visible.map((item, index) => ({ ...item, index })).filter(({ entry }) => entry.section === section);
          const options = rows.map(({ entry, title, index }) => (
            <div
              key={entry.step.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === current}
              className={`${styles.option} ${index === current ? styles.optionActive : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => onChoose(entry.step)}
            >
              <span>{title}</span>
              {entry.repeated && <span className={styles.every}>{t('controls.everyRow')}</span>}
            </div>
          ));
          return section ? (
            <div key={section} role="group" aria-label={section} className={styles.group}>
              <div className={styles.groupLabel} aria-hidden="true">
                {section}
              </div>
              {options}
            </div>
          ) : (
            <div key="none" className={styles.group}>
              {options}
            </div>
          );
        })}
      </div>
    </div>
  );
};
