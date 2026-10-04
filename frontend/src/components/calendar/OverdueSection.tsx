import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDateFormat } from '../../hooks/useDateFormat';
import type { CalendarItem } from '../../types/calendar';
import { typeIcon } from './calendarStyle';
import styles from './Calendar.module.css';

/**
 * FR-CAL-04: what is open and past its time, on today's date, not only on
 * the day it was due. It leads the day and agenda views when today is on
 * screen, oldest first, each with its original date.
 */
export const OverdueSection: React.FC<{
  items: CalendarItem[];
  truncated?: boolean;
  onOpen: (item: CalendarItem) => void;
  personColour?: (userId: string) => string | undefined;
}> = ({ items, truncated, onOpen, personColour }) => {
  const { t } = useTranslation('appointments');
  const dates = useDateFormat();
  if (items.length === 0) return null;

  return (
    <section className={styles.overdue} aria-labelledby="calendar-overdue" data-testid="calendar-overdue">
      <h3 id="calendar-overdue" className={styles.overdueTitle}>
        {t('calendar.overdue.title')} <span>{`(${items.length})`}</span>
      </h3>
      <ul className={styles.overdueList}>
        {items.map((item) => {
          const Icon = typeIcon(item.type);
          const colour = personColour?.(item.assignedUserId);
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`${styles.agendaRow} ${styles.agendaRowOverdue} ${styles[`type-${item.type}`]}`}
                style={colour ? ({ '--bar-colour': colour } as React.CSSProperties) : undefined}
                onClick={() => onOpen(item)}
                data-overdue
              >
                <span className={styles.agendaTime}>{dates.date(item.scheduledAt)}</span>
                <span className={styles.agendaMain}>
                  <span className={styles.agendaTitle}>
                    <Icon size={14} aria-hidden="true" />
                    {t(`calendar.type.${item.type}`)} · {item.companyName}
                    <span className={styles.overdueTag}>{t('calendar.overdue.tag')}</span>
                  </span>
                  <span className={styles.agendaMeta}>
                    {t('calendar.overdue.was', { date: dates.dateTime(item.scheduledAt) })}
                    {personColour ? ` · ${item.assignedUserName}` : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {truncated && <p className={styles.notice}>{t('calendar.truncated')}</p>}
    </section>
  );
};
