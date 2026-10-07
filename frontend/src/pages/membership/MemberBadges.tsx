import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Tier } from '../../services/membershipSettingsService';
import type { MemberStatus } from '../../services/memberService';
import styles from './Members.module.css';

/** A tier chip in the workspace's tier colour. */
export const TierBadge: React.FC<{ label: string; colour: string | null; tier: Tier }> = ({ label, colour, tier }) => (
  <span className={styles.tier} data-tier={tier} style={colour ? { borderColor: colour } : undefined}>
    <span className={styles.tierDot} style={colour ? { background: colour } : undefined} aria-hidden />
    {label}
  </span>
);

const STATUS_CLASS: Record<MemberStatus, string> = {
  ACTIVE: styles.statusActive,
  SUSPENDED: styles.statusSuspended,
  CLOSED: styles.statusClosed,
};

/** The member's status. Validity is the status and nothing else (FR-MEM-06). */
export const StatusBadge: React.FC<{ status: MemberStatus }> = ({ status }) => {
  const { t } = useTranslation('members');
  return <span className={`${styles.status} ${STATUS_CLASS[status]}`}>{t(`status.${status}`)}</span>;
};
