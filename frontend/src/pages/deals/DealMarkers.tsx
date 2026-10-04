import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlarmClock, Hourglass } from 'lucide-react';
import type { DealSummary } from '../../types/deal';
import styles from './DealMarkers.module.css';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * FR-DEAL-12, on the board and the list: an open follow-up past its due time,
 * and no activity for the workspace's number of days. The server decides
 * both; this only shows them.
 */
export const DealMarkers: React.FC<{ deal: Pick<DealSummary, 'hasOverdueFollowUp' | 'isStale' | 'lastActivityAt'> }> = ({ deal }) => {
  const { t } = useTranslation('deals');
  if (!deal.hasOverdueFollowUp && !deal.isStale) return null;
  const quietDays = Math.max(0, Math.floor((Date.now() - new Date(deal.lastActivityAt).getTime()) / DAY_MS));
  return (
    <span className={styles.markers}>
      {deal.hasOverdueFollowUp && (
        <span className={`${styles.marker} ${styles.overdue}`}>
          <AlarmClock size={12} aria-hidden="true" /> {t('markers.overdueFollowUp')}
        </span>
      )}
      {deal.isStale && (
        <span className={`${styles.marker} ${styles.stale}`}>
          <Hourglass size={12} aria-hidden="true" /> {t('markers.stale', { count: quietDays })}
        </span>
      )}
    </span>
  );
};
