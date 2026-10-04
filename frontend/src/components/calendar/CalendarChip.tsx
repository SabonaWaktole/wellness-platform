import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDateFormat } from '../../hooks/useDateFormat';
import type { CalendarItem } from '../../types/calendar';
import { isOpen, typeIcon } from './calendarStyle';
import styles from './Calendar.module.css';

export interface CalendarChipProps {
  item: CalendarItem;
  onOpen: (item: CalendarItem) => void;
  /** The salesperson's colour on the item's left edge; the type's colour when absent (FR-CAL-05). */
  personColour?: string;
  /** Dimmed while its wrapper is being dragged (FR-CAL-07; the wrapper owns the drag, Firefox does not drag a button). */
  isDragging?: boolean;
  hideTime?: boolean;
}

/**
 * One item on the calendar (FR-CAL-01): the type's icon and colour, the
 * time, the company. An overdue one is red and says so in words. Opens the
 * item panel; also reachable and operable from the keyboard.
 */
export const CalendarChip: React.FC<CalendarChipProps> = ({ item, onOpen, personColour, isDragging, hideTime }) => {
  const { t } = useTranslation('appointments');
  const dates = useDateFormat();
  const Icon = typeIcon(item.type);
  const time = dates.time(item.scheduledAt);
  const done = !isOpen(item);

  return (
    <button
      type="button"
      className={[
        styles.chip,
        styles[`type-${item.type}`],
        item.kind === 'FOLLOW_UP' ? styles.chipFollowUp : '',
        item.isOverdue ? styles.chipOverdue : '',
        done ? styles.chipDone : '',
        isDragging ? styles.chipDragging : '',
      ].join(' ')}
      style={personColour ? ({ '--bar-colour': personColour } as React.CSSProperties) : undefined}
      onClick={() => onOpen(item)}
      data-overdue={item.isOverdue || undefined}
      data-kind={item.kind}
      aria-label={t('calendar.itemLabel', {
        type: t(`calendar.type.${item.type}`),
        company: item.companyName,
        time,
        kind: item.kind === 'FOLLOW_UP' ? t('calendar.kind.FOLLOW_UP') : '',
      })}
      title={`${time} · ${t(`calendar.type.${item.type}`)} · ${item.companyName}`}
    >
      <Icon size={13} className={styles.chipIcon} aria-hidden="true" />
      {!hideTime && <span className={styles.chipTime}>{time}</span>}
      <span className={styles.chipText}>{item.companyName}</span>
      {item.isOverdue && <span className={styles.overdueTag}>{t('calendar.overdue.tag')}</span>}
    </button>
  );
};
