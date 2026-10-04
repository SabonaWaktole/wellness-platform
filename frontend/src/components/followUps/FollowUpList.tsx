import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../ui/Badge/Badge';
import { Button } from '../ui/Button/Button';
import { useToast } from '../ui/Toast/toastContext';
import { ActivityDialog } from '../activities/ActivityDialog';
import { channelIcon } from '../activities/channelIcon';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useDealText } from '../../hooks/useDealText';
import { usePermission, usePermissionScope } from '../../hooks/usePermission';
import { useTeam } from '../../hooks/useTeam';
import { followUpsChanged } from '../../hooks/useOverdueFollowUpCount';
import { clientService } from '../../services/clientService';
import type { DealType } from '../../types/deal';
import type { FollowUp } from '../../types/followUp';
import { CancelFollowUpModal, ReassignFollowUpModal, RescheduleFollowUpModal } from './FollowUpActionModals';
import styles from './FollowUps.module.css';

export interface FollowUpListProps {
  items: FollowUp[];
  /** Called after any change, so the owner reloads what it shows (the change event fires as well). */
  onChanged?: () => void;
  /** The company's name and link; off on the company page itself. */
  showCompany?: boolean;
  /** The salesperson's name; on in the team view. */
  showAssignee?: boolean;
  /** No actions, whatever the permissions (the CEO's view, FR-FUP-08). */
  readOnly?: boolean;
  /** Scrolled to and outlined, e.g. from a notification (`?open=`). */
  highlightId?: string | null;
}

/**
 * Open follow-ups with what to do about them (FR-FUP-05, 06, 10): overdue
 * ones in red, Complete (the activity form, pre-filled with the company, the
 * deal and the type), Reschedule and Cancel, and Reassign for a Sales
 * Manager. The server decides every rule again.
 */
export const FollowUpList: React.FC<FollowUpListProps> = ({ items, onChanged, showCompany = true, showAssignee = false, readOnly = false, highlightId }) => {
  const { t } = useTranslation('followUps');
  const { tenantSlug } = useParams();
  const toast = useToast();
  const dates = useDateFormat();
  const dealText = useDealText();
  const canManage = usePermission('followups.manage') && !readOnly;
  const manageScope = usePermissionScope('followups.manage');
  const canReassign = canManage && (manageScope === 'TEAM' || manageScope === 'ALL');
  const { staff, fetchStaff } = useTeam();

  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [rescheduling, setRescheduling] = useState<FollowUp | null>(null);
  const [cancelling, setCancelling] = useState<FollowUp | null>(null);
  const [reassigning, setReassigning] = useState<FollowUp | null>(null);
  const highlighted = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (canReassign) fetchStaff();
  }, [canReassign, fetchStaff]);

  useEffect(() => {
    highlighted.current?.scrollIntoView?.({ block: 'center' });
  }, [highlightId, items]);

  const complete = async (followUp: FollowUp) => {
    if (!tenantSlug) return;
    // The activity needs the company's contacts (FR-ACT-02).
    try {
      const client = await clientService.getClient(tenantSlug, followUp.clientId);
      setContacts((client.contacts ?? []).map(({ id, name }) => ({ id, name })));
    } catch {
      setContacts([]);
    }
    setCompleting(followUp);
  };

  const done = () => {
    setRescheduling(null);
    setCancelling(null);
    setReassigning(null);
    followUpsChanged();
    onChanged?.();
  };

  return (
    <>
      <ul className={styles.list}>
        {items.map((followUp) => {
          const Icon = channelIcon(followUp.type);
          const isHighlighted = followUp.id === highlightId;
          return (
            <li
              key={followUp.id}
              ref={isHighlighted ? highlighted : undefined}
              className={[styles.item, followUp.isOverdue ? styles.itemOverdue : '', isHighlighted ? styles.itemHighlighted : ''].join(' ')}
              data-overdue={followUp.isOverdue || undefined}
            >
              <div className={styles.itemMain}>
                <span className={styles.itemTitle}>
                  <Icon size={16} aria-hidden="true" />
                  {t(`type.${followUp.type}`)}
                  {showCompany && (
                    <Link to={`/${tenantSlug}/clients/${followUp.clientId}`} title={t('item.openCompany')}>
                      {followUp.companyName}
                    </Link>
                  )}
                  {followUp.isOverdue && <Badge variant="error">{t('item.overdue')}</Badge>}
                </span>
                <span className={`${styles.due} ${followUp.isOverdue ? styles.dueOverdue : ''}`}>
                  {t('item.due', { date: dates.dateTime(followUp.scheduledAt) })}
                </span>
                <span className={styles.itemMeta}>
                  {followUp.dealId && (
                    <Link to={`/${tenantSlug}/deals/${followUp.dealId}`} title={t('item.openDeal')}>
                      {dealText.title({ title: followUp.dealTitle, companyName: followUp.companyName, type: (followUp.dealType ?? 'NEW_CONTRACT') as DealType })}
                    </Link>
                  )}
                  {followUp.contactName && <span>{t('item.with', { name: followUp.contactName })}</span>}
                  {showAssignee && <span>{t('item.assignedTo', { name: followUp.assignedUserName })}</span>}
                </span>
                {followUp.notes && <p className={styles.note}>{followUp.notes}</p>}
              </div>
              {canManage && (
                <div className={styles.itemActions} role="group" aria-label={t('actions.label', { company: followUp.companyName })}>
                  <Button size="sm" onClick={() => complete(followUp)}>
                    {t('actions.complete')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRescheduling(followUp)}>
                    {t('actions.reschedule')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCancelling(followUp)}>
                    {t('actions.cancel')}
                  </Button>
                  {canReassign && (
                    <Button size="sm" variant="ghost" onClick={() => setReassigning(followUp)}>
                      {t('actions.reassign')}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {canManage && (
        <>
          <ActivityDialog
            isOpen={!!completing}
            onClose={() => setCompleting(null)}
            clientId={completing?.clientId ?? ''}
            contacts={contacts}
            completing={completing}
            onSaved={() => {
              toast.success(t('complete.done'));
              followUpsChanged();
              onChanged?.();
            }}
          />
          <RescheduleFollowUpModal followUp={rescheduling} onClose={() => setRescheduling(null)} onDone={done} />
          <CancelFollowUpModal followUp={cancelling} onClose={() => setCancelling(null)} onDone={done} />
          {canReassign && <ReassignFollowUpModal followUp={reassigning} onClose={() => setReassigning(null)} onDone={done} staff={staff} />}
        </>
      )}
    </>
  );
};
