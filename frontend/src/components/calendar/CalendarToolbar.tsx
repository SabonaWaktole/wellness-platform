import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '../ui/Button/Button';
import { CALENDAR_VIEWS, type CalendarView } from '../../utils/calendarDays';
import styles from './Calendar.module.css';

export interface CalendarToolbarProps {
  view: CalendarView;
  title: string;
  onView: (view: CalendarView) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Absent for a viewer who cannot plan (the CEO, FR-CAL-06): no create button. */
  onPlan?: () => void;
}

export const CalendarToolbar: React.FC<CalendarToolbarProps> = ({ view, title, onView, onPrevious, onNext, onToday, onPlan }) => {
  const { t } = useTranslation('appointments');
  return (
    <div className={styles.toolbar} role="toolbar" aria-label={t('calendar.toolbar')}>
      <div className={styles.nav}>
        <button type="button" className={styles.iconButton} onClick={onPrevious} aria-label={t('calendar.previous')}>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <button type="button" className={styles.todayButton} onClick={onToday}>
          {t('calendar.today')}
        </button>
        <button type="button" className={styles.iconButton} onClick={onNext} aria-label={t('calendar.next')}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <h2 className={styles.title} aria-live="polite">
          {title}
        </h2>
      </div>
      <div className={styles.controls}>
        <div className={styles.segmented} role="group" aria-label={t('calendar.viewLabel')}>
          {CALENDAR_VIEWS.map((option) => (
            <button
              key={option}
              type="button"
              className={`${styles.segment} ${view === option ? styles.segmentActive : ''}`}
              aria-pressed={view === option}
              onClick={() => onView(option)}
            >
              {t(`calendar.${option}`)}
            </button>
          ))}
        </div>
        {onPlan && (
          <Button icon={<Plus size={16} />} onClick={onPlan}>
            {t('calendar.plan')}
          </Button>
        )}
      </div>
    </div>
  );
};
