import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDateFormat } from '../../hooks/useDateFormat';
import { isSameMonth } from '../../utils/calendarDays';
import type { CalendarItem } from '../../types/calendar';
import { CalendarChip } from './CalendarChip';
import { dayAsDate, groupByDay } from './calendarGrouping';
import styles from './Calendar.module.css';

/** More than this in a day and the rest go behind "+N more". */
const CHIPS_PER_DAY = 3;

export interface CalendarViewProps {
  days: string[];
  items: CalendarItem[];
  today: string;
  onOpen: (item: CalendarItem) => void;
  /** Shows a day in the day view. */
  onPickDay: (day: string) => void;
  /** Present in the team view: each item carries its salesperson's colour (FR-CAL-05). */
  personColour?: (userId: string) => string;
}

/** The month: whole weeks, Monday first, the neighbouring months' days dimmed. */
export const CalendarMonthView: React.FC<CalendarViewProps & { anchor: string }> = ({ days, items, today, anchor, onOpen, onPickDay, personColour }) => {
  const { t } = useTranslation('appointments');
  const dates = useDateFormat();
  const byDay = groupByDay(items, dates.dayKey);
  const weekdays = days.slice(0, 7);
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  const name = (key: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(dates.locale, { ...options, timeZone: 'UTC' }).format(dayAsDate(key));

  return (
    <div className={styles.month} role="grid" aria-label={t('calendar.month')}>
      <div className={styles.monthHeader} role="row">
        {weekdays.map((key) => (
          <div key={key} className={styles.weekdayName} role="columnheader">
            {name(key, { weekday: 'short' })}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className={styles.monthWeek} role="row">
          {week.map((key) => {
            const dayItems = byDay.get(key) ?? [];
            const shown = dayItems.slice(0, CHIPS_PER_DAY);
            const hidden = dayItems.length - shown.length;
            return (
              <div key={key} className={`${styles.monthCell} ${isSameMonth(key, anchor) ? '' : styles.monthCellOutside}`} role="gridcell" data-day={key}>
                <button
                  type="button"
                  className={`${styles.dayNumber} ${key === today ? styles.dayNumberToday : ''}`}
                  onClick={() => onPickDay(key)}
                  aria-label={t('calendar.openDay', { date: name(key, { weekday: 'long', day: 'numeric', month: 'long' }) })}
                  aria-current={key === today ? 'date' : undefined}
                >
                  {Number(key.slice(8))}
                </button>
                {shown.map((item) => (
                  <CalendarChip key={item.id} item={item} onOpen={onOpen} personColour={personColour?.(item.assignedUserId)} />
                ))}
                {hidden > 0 && (
                  <button type="button" className={styles.moreButton} onClick={() => onPickDay(key)}>
                    {t('calendar.more', { count: hidden })}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
