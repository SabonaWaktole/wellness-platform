import React from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, FileClock } from 'lucide-react';
import type { ContractCalendarItem } from '../../types/calendar';
import styles from './Calendar.module.css';

export interface ContractDateChipProps {
  item: ContractCalendarItem;
  onOpen: (contractId: string) => void;
  /** The salesperson's colour on the item's left edge, in the team view (FR-CAL-05). */
  personColour?: string;
}

/**
 * A contract's end date or renewal date on the calendar (FR-REN-11). It is not
 * an appointment: it has no time, is not draggable and has no status, and a
 * click opens the contract. Its icon and dashed edge tell it apart from the
 * activities.
 */
export const ContractDateChip: React.FC<ContractDateChipProps> = ({ item, onOpen, personColour }) => {
  const { t } = useTranslation('appointments');
  const Icon = item.kind === 'CONTRACT_END' ? FileClock : CalendarClock;
  const label = t(`calendar.contract.${item.kind}`);

  return (
    <button
      type="button"
      className={`${styles.chip} ${styles.contractChip}`}
      style={personColour ? ({ '--bar-colour': personColour } as React.CSSProperties) : undefined}
      onClick={() => onOpen(item.contractId)}
      data-kind={item.kind}
      aria-label={t('calendar.contract.itemLabel', { kind: label, number: item.number, company: item.companyName })}
      title={`${label} · ${item.number} · ${item.companyName}`}
    >
      <Icon size={13} className={styles.chipIcon} aria-hidden="true" />
      <span className={styles.chipText}>
        {label} · {item.companyName}
      </span>
    </button>
  );
};
