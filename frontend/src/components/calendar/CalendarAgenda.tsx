import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useDealText } from '../../hooks/useDealText';
import type { CalendarItem } from '../../types/calendar';
import type { DealType } from '../../types/deal';
import { dayAsDate, groupByDay, groupContractsByDay } from './calendarGrouping';
import { ContractDateChip } from './ContractDateChip';
import { isOpen, typeIcon } from './calendarStyle';
import type { CalendarViewProps } from './CalendarMonthView';
import styles from './Calendar.module.css';

/**
 * The agenda list (FR-CAL-01): the days that have something, in order, each
 * item with its time, type, company, deal, contact and place. Used on every
 * width, and the view a phone opens on.
 */
export const CalendarAgenda: React.FC<Pick<CalendarViewProps, 'days' | 'items' | 'today' | 'onOpen' | 'personColour' | 'contractItems' | 'onOpenContract'>> = ({ days, items, today, onOpen, personColour, contractItems = [], onOpenContract }) => {
  const { t } = useTranslation('appointments');
  const dates = useDateFormat();
  const dealText = useDealText();
  const byDay = groupByDay(items, dates.dayKey);
  const contractsByDay = groupContractsByDay(contractItems);
  const populated = days.filter((key) => byDay.has(key) || contractsByDay.has(key));
  const dayName = (key: string) => new Intl.DateTimeFormat(dates.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(dayAsDate(key));

  if (populated.length === 0) return <p className={styles.empty}>{t('calendar.emptyAgenda')}</p>;

  return (
    <div className={styles.agenda}>
      {populated.map((key) => (
        <section key={key} className={styles.agendaDay} aria-label={dayName(key)} data-day={key}>
          <h3 className={`${styles.agendaDayTitle} ${key === today ? styles.agendaDayToday : ''}`}>
            {dayName(key)}
            {key === today && ` · ${t('calendar.today')}`}
          </h3>
          <ul className={styles.agendaList}>
            {(contractsByDay.get(key) ?? []).map((item) => (
              <li key={item.id}>
                <ContractDateChip item={item} onOpen={(id) => onOpenContract?.(id)} personColour={item.assignedUserId ? personColour?.(item.assignedUserId) : undefined} />
              </li>
            ))}
            {(byDay.get(key) ?? []).map((item) => (
              <li key={item.id}>
                <AgendaRow item={item} onOpen={onOpen} colour={personColour?.(item.assignedUserId)} showPerson={!!personColour} dealTitle={(i) => dealText.title({ title: i.dealTitle, companyName: i.companyName, type: (i.dealType ?? 'NEW_CONTRACT') as DealType })} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

const AgendaRow: React.FC<{
  item: CalendarItem;
  onOpen: (item: CalendarItem) => void;
  colour?: string;
  showPerson: boolean;
  dealTitle: (item: CalendarItem) => string;
}> = ({ item, onOpen, colour, showPerson, dealTitle }) => {
  const { t } = useTranslation('appointments');
  const dates = useDateFormat();
  const Icon = typeIcon(item.type);
  const meta = [
    item.dealId ? dealTitle(item) : null,
    item.contactName ? t('calendar.with', { name: item.contactName }) : null,
    item.place,
    showPerson ? item.assignedUserName : null,
  ].filter(Boolean);

  return (
    <button
      type="button"
      className={[styles.agendaRow, styles[`type-${item.type}`], item.isOverdue ? styles.agendaRowOverdue : '', isOpen(item) ? '' : styles.agendaRowDone].join(' ')}
      style={colour ? ({ '--bar-colour': colour } as React.CSSProperties) : undefined}
      onClick={() => onOpen(item)}
      data-overdue={item.isOverdue || undefined}
      data-kind={item.kind}
    >
      <span className={styles.agendaTime}>
        {dates.time(item.scheduledAt)}
        {item.endAt && <span className={styles.agendaMeta}> – {dates.time(item.endAt)}</span>}
      </span>
      <span className={styles.agendaMain}>
        <span className={styles.agendaTitle}>
          <Icon size={14} aria-hidden="true" />
          {t(`calendar.type.${item.type}`)} · {item.companyName}
          {item.kind === 'FOLLOW_UP' && <span className={styles.agendaMeta}>({t('calendar.kind.FOLLOW_UP')})</span>}
          {item.isOverdue && <span className={styles.overdueTag}>{t('calendar.overdue.tag')}</span>}
        </span>
        {meta.length > 0 && <span className={styles.agendaMeta}>{meta.join(' · ')}</span>}
        {item.notes && <span className={styles.agendaMeta}>{item.notes}</span>}
      </span>
    </button>
  );
};
