import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { MessageSquare, Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Card } from '../../components/ui/Card/Card';
import { ActivityDialog } from '../../components/activities/ActivityDialog';
import { ActivityDetails } from '../../components/activities/ActivityDetails';
import { channelIcon } from '../../components/activities/channelIcon';
import { useCanEditActivity } from '../../components/activities/useCanEditActivity';
import { useDateFormat } from '../../hooks/useDateFormat';
import { usePermission } from '../../hooks/usePermission';
import { dealService } from '../../services/dealService';
import { isOpenStage, type DealDetail } from '../../types/deal';
import type { ActivityView } from '../../types/client';
import styles from './DealDetailContent.module.css';

/**
 * The deal page's activities (FR-ACT-05, FR-DEAL-03), newest first by when
 * they happened, with "Record activity" on an open deal. Saving reloads the
 * deal too: the first activity on a New Lead moves it to Contacted
 * (FR-DEAL-08).
 */
export const DealActivitiesSection: React.FC<{ deal: DealDetail; onDealChanged: () => void }> = ({ deal, onDealChanged }) => {
  const { t } = useTranslation('clients');
  const { t: td } = useTranslation('deals');
  const { t: tc } = useTranslation('common');
  const { tenantSlug } = useParams();
  const dates = useDateFormat();
  const canEditActivity = useCanEditActivity();
  const canAddActivities = usePermission('activities.add');
  const canAddNotes = usePermission('notes.add');
  const canRecord = canAddActivities || canAddNotes;
  const [activities, setActivities] = useState<ActivityView[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityView | null>(null);

  const load = useCallback(async () => {
    if (!tenantSlug) return;
    try {
      setActivities(await dealService.activities(tenantSlug, deal.id));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [tenantSlug, deal.id]);

  useEffect(() => {
    load();
  }, [load]);

  const open = (activity: ActivityView | null) => {
    setEditing(activity);
    setIsDialogOpen(true);
  };

  return (
    <Card padding="lg">
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIcon} aria-hidden="true">
            <MessageSquare size={18} />
          </span>
          {td('detail.activities')}
        </h2>
        {canRecord && isOpenStage(deal.stage) && (
          <Button variant="outline" size="sm" icon={<Plus size={16} />} onClick={() => open(null)}>
            {td('detail.recordActivity')}
          </Button>
        )}
      </div>

      {loadFailed && <p className={styles.muted}>{td('detail.activitiesLoadFailed')}</p>}
      {!activities && !loadFailed && <p className={styles.muted}>{tc('state.loading')}</p>}
      {activities?.length === 0 && <p className={styles.muted}>{td('detail.noActivities')}</p>}

      {activities && activities.length > 0 && (
        <ol className={styles.activities} aria-label={td('detail.activities')}>
          {activities.map((activity) => {
            const Icon = channelIcon(activity.channel);
            return (
              <li key={activity.id} className={styles.activityItem}>
                <div className={styles.activityHeader}>
                  <Icon size={16} aria-hidden="true" />
                  <span className={styles.historyChange}>{t(`detail.channels.${activity.channel}`)}</span>
                  <span className={styles.muted}>
                    {t('detail.timeline.byActor', { timestamp: dates.dateTime(activity.occurredAt), actor: activity.author.name })}
                  </span>
                </div>
                <ActivityDetails
                  activity={activity}
                  actions={
                    canEditActivity(activity) ? (
                      <Button variant="ghost" size="sm" onClick={() => open(activity)}>
                        {t('activity.edit')}
                      </Button>
                    ) : undefined
                  }
                />
              </li>
            );
          })}
        </ol>
      )}

      <ActivityDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        clientId={deal.clientId}
        contacts={deal.contacts}
        dealId={deal.id}
        activity={editing}
        onSaved={() => {
          load();
          onDealChanged();
        }}
      />
    </Card>
  );
};
