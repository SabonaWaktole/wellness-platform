import React from 'react';
import { useTranslation } from 'react-i18next';
import { getStaffDisplayName } from '../../utils/userUtils';
import type { StaffMember } from '../../hooks/useTeam';
import styles from './Calendar.module.css';

export interface TeamFilterProps {
  staff: StaffMember[];
  selected: string[];
  onChange: (userIds: string[]) => void;
  colourOf: (userId: string) => string;
}

/**
 * FR-CAL-05: show one, several or all salespeople, each with their colour.
 * Nobody selected means everyone in the viewer's scope. The server narrows
 * to that scope whatever is asked for.
 */
export const TeamFilter: React.FC<TeamFilterProps> = ({ staff, selected, onChange, colourOf }) => {
  const { t } = useTranslation('appointments');
  const members = staff.filter((member) => member.isActive !== false);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);

  return (
    <div className={styles.filterBar} role="group" aria-label={t('calendar.team.label')}>
      <span className={styles.filterLabel}>{t('calendar.team.label')}</span>
      <button type="button" className={styles.personChip} style={{ '--person-colour': 'var(--color-primary)' } as React.CSSProperties} aria-pressed={selected.length === 0} onClick={() => onChange([])}>
        {t('calendar.team.everyone')}
      </button>
      {members.map((member) => (
        <button
          key={member.id}
          type="button"
          className={styles.personChip}
          style={{ '--person-colour': colourOf(member.id) } as React.CSSProperties}
          aria-pressed={selected.includes(member.id)}
          onClick={() => toggle(member.id)}
        >
          <span className={styles.personDot} aria-hidden="true" />
          {getStaffDisplayName(member)}
        </button>
      ))}
    </div>
  );
};
