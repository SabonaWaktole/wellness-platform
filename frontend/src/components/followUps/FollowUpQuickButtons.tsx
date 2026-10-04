import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { CalendarClock, CalendarPlus } from 'lucide-react';
import { Button } from '../ui/Button/Button';
import { useToast } from '../ui/Toast/toastContext';
import { useActiveLookups } from '../../hooks/useActiveLookups';
import { useDateFormat } from '../../hooks/useDateFormat';
import { usePermission } from '../../hooks/usePermission';
import { followUpService } from '../../services/followUpService';
import { followUpsChanged } from '../../hooks/useOverdueFollowUpCount';
import type { FollowUp } from '../../types/followUp';
import { followUpErrorMessage } from './followUpErrors';
import { ScheduleFollowUpModal } from './ScheduleFollowUpModal';
import styles from './FollowUps.module.css';

export interface FollowUpQuickButtonsProps {
  clientId: string;
  dealId?: string | null;
  /** The activity just saved (FR-ACT-04): the follow-up takes its deal, contact and next action. */
  fromActivityId?: string | null;
  onScheduled?: (followUp: FollowUp) => void;
  /** Hides the "Follow up" caption, where the surrounding text already says it. */
  hideLabel?: boolean;
}

/**
 * One click to schedule a follow-up (FR-FUP-01): one button per active
 * follow-up interval from Settings → Lists (default 3, 5, 7 days) and
 * "Custom date". The server works out the date, in the workspace's time
 * zone, moving a weekend to Monday (FR-FUP-03). Nothing renders without
 * `followups.manage`.
 */
export const FollowUpQuickButtons: React.FC<FollowUpQuickButtonsProps> = ({ clientId, dealId, fromActivityId, onScheduled, hideLabel }) => {
  const { t } = useTranslation('followUps');
  const { tenantSlug } = useParams();
  const toast = useToast();
  const dates = useDateFormat();
  const canManage = usePermission('followups.manage');
  const intervals = useActiveLookups('follow-up-intervals');
  const [busy, setBusy] = useState<number | null>(null);
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  if (!canManage) return null;

  const scheduled = (followUp: FollowUp) => {
    toast.success(t('quick.scheduled', { date: dates.dateTime(followUp.scheduledAt) }));
    followUpsChanged();
    onScheduled?.(followUp);
  };

  const schedule = async (days: number) => {
    if (!tenantSlug) return;
    setBusy(days);
    try {
      scheduled(await followUpService.schedule(tenantSlug, { clientId, dealId: dealId ?? undefined, fromActivityId, intervalDays: days }));
    } catch (error) {
      toast.error(followUpErrorMessage(error, t));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.quick} role="group" aria-label={t('quick.label')}>
      {!hideLabel && (
        <span className={styles.quickLabel}>
          <CalendarClock size={16} aria-hidden="true" /> {t('quick.label')}
        </span>
      )}
      {[...intervals]
        .sort((a, b) => a.days - b.days)
        .map((interval) => (
          <Button
            key={interval.id}
            variant="outline"
            size="sm"
            aria-label={t('quick.intervalAria', { days: interval.days })}
            disabled={busy !== null}
            isLoading={busy === interval.days}
            onClick={() => schedule(interval.days)}
          >
            {t('quick.interval', { days: interval.days })}
          </Button>
        ))}
      <Button variant="outline" size="sm" icon={<CalendarPlus size={16} />} disabled={busy !== null} onClick={() => setIsCustomOpen(true)}>
        {t('quick.custom')}
      </Button>
      <ScheduleFollowUpModal
        isOpen={isCustomOpen}
        onClose={() => setIsCustomOpen(false)}
        clientId={clientId}
        dealId={dealId}
        fromActivityId={fromActivityId}
        onScheduled={(followUp) => {
          setIsCustomOpen(false);
          scheduled(followUp);
        }}
      />
    </div>
  );
};
