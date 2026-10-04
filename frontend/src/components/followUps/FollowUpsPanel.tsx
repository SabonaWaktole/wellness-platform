import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { CalendarClock, CalendarPlus } from 'lucide-react';
import { Card } from '../ui/Card/Card';
import { Button } from '../ui/Button/Button';
import { PlanActivityDialog } from '../calendar/PlanActivityDialog';
import { usePermission } from '../../hooks/usePermission';
import { onFollowUpsChanged } from '../../hooks/useOverdueFollowUpCount';
import { followUpService } from '../../services/followUpService';
import type { FollowUp } from '../../types/followUp';
import { FollowUpList } from './FollowUpList';
import { FollowUpQuickButtons } from './FollowUpQuickButtons';
import styles from './FollowUps.module.css';

/**
 * A company's or a deal's open follow-ups, with the one-click buttons to
 * schedule another (FR-FUP-01, FR-DEAL-03). It reloads whenever a follow-up
 * changes anywhere on the page, the activity dialog included. On a deal, a
 * follow-up from Offer Sent moves it to Follow-Up, so `onChanged` lets the
 * deal page reload too.
 */
export const FollowUpsPanel: React.FC<{
  clientId: string;
  dealId?: string;
  /** False on a closed deal: it takes no new follow-ups. */
  canSchedule?: boolean;
  onChanged?: () => void;
  /** Called after a meeting, visit or call was planned from here (FR-CAL-02). */
  onPlanned?: () => void;
  titleClassName?: string;
  headerClassName?: string;
}> = ({ clientId, dealId, canSchedule = true, onChanged, onPlanned, titleClassName, headerClassName }) => {
  const { t } = useTranslation('followUps');
  const { tenantSlug } = useParams();
  const canView = usePermission('calendar.view');
  const canPlan = usePermission('activities.add');
  const [isPlanning, setIsPlanning] = useState(false);
  const [items, setItems] = useState<FollowUp[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    if (!tenantSlug || !canView) return;
    try {
      setItems(await followUpService.list(tenantSlug, dealId ? { dealId } : { clientId }));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [tenantSlug, canView, clientId, dealId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () =>
      onFollowUpsChanged(() => {
        load();
        onChanged?.();
      }),
    [load, onChanged]
  );

  if (!canView) return null;

  return (
    <Card padding="lg">
      <div className={headerClassName}>
        <h2 className={titleClassName}>
          <CalendarClock size={18} aria-hidden="true" /> {t('section.title')}
        </h2>
        {canPlan && canSchedule && (
          <Button variant="outline" size="sm" icon={<CalendarPlus size={16} />} onClick={() => setIsPlanning(true)}>
            {t('section.plan')}
          </Button>
        )}
      </div>
      <div className={styles.afterSave}>
        {canSchedule && (
          <FollowUpQuickButtons clientId={clientId} dealId={dealId} />
        )}
        {loadFailed && <p className={styles.muted}>{t('loadFailed')}</p>}
        {!items && !loadFailed && <p className={styles.muted}>{t('loading')}</p>}
        {items?.length === 0 && <p className={styles.muted}>{t('section.none')}</p>}
        {items && items.length > 0 && <FollowUpList items={items} showCompany={false} showAssignee />}
      </div>
      <PlanActivityDialog
        isOpen={isPlanning}
        onClose={() => setIsPlanning(false)}
        clientId={clientId}
        dealId={dealId}
        onSaved={() => {
          setIsPlanning(false);
          onPlanned?.();
        }}
      />
    </Card>
  );
};
