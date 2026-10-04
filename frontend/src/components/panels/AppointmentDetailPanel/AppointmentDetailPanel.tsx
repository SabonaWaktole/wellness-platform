import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Building2, Calendar, CheckCircle2, Check, Clock, Edit, Handshake, MapPin, RefreshCw, User, XCircle } from 'lucide-react';
import { SlideOver } from '../../ui/SlideOver/SlideOver';
import { Badge } from '../../ui/Badge/Badge';
import { Button } from '../../ui/Button/Button';
import { TextInput } from '../../ui/TextInput/TextInput';
import { useToast } from '../../ui/Toast/toastContext';
import { ActivityDialog } from '../../activities/ActivityDialog';
import { CancelFollowUpModal, RescheduleFollowUpModal } from '../../followUps/FollowUpActionModals';
import { RescheduleItemDialog } from '../../calendar/RescheduleItemDialog';
import { typeIcon } from '../../calendar/calendarStyle';
import { useDateFormat } from '../../../hooks/useDateFormat';
import { useDealText } from '../../../hooks/useDealText';
import { followUpsChanged } from '../../../hooks/useOverdueFollowUpCount';
import { usePermission } from '../../../hooks/usePermission';
import { useStatusLabel } from '../../../hooks/useStatusLabel';
import { appointmentService } from '../../../services/appointmentService';
import { clientService } from '../../../services/clientService';
import { followUpService } from '../../../services/followUpService';
import type { CalendarItem } from '../../../types/calendar';
import type { DealType } from '../../../types/deal';
import type { FollowUp } from '../../../types/followUp';
import styles from './AppointmentDetailPanel.module.css';

export interface AppointmentDetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  item: CalendarItem | null;
  /** No actions, whatever the permissions: the CEO's calendar (FR-CAL-06). */
  readOnly?: boolean;
  /** Called after any change, so the owner reloads what it shows. */
  onChanged: () => void;
  /** Opens the planning dialog on this item (planned items only). */
  onEdit?: (item: CalendarItem) => void;
}

const statusToken = (status: string) => {
  switch (status) {
    case 'SCHEDULED': return 'primary';
    case 'CONFIRMED': return 'success';
    case 'COMPLETED': return 'secondary';
    case 'CANCELLED': return 'error';
    default: return 'warning';
  }
};

/**
 * The item panel (FR-CAL-03): a calendar item's details and what can be done
 * with it, without leaving the page. A follow-up is completed by recording the
 * activity that happened, rescheduled or cancelled, under `followups.manage`;
 * a planned item is confirmed, completed, edited, rescheduled or cancelled,
 * under `activities.add`. Actions are hidden without the permission, and the
 * server decides every rule again. Open company and Open deal always show.
 */
export const AppointmentDetailPanel: React.FC<AppointmentDetailPanelProps> = ({ isOpen, onClose, item, readOnly = false, onChanged, onEdit }) => {
  const { t } = useTranslation('appointments');
  const { tenantSlug } = useParams();
  const toast = useToast();
  const dates = useDateFormat();
  const dealText = useDealText();
  const statusLabel = useStatusLabel();
  const canManageFollowUps = usePermission('followups.manage') && !readOnly;
  const canPlan = usePermission('activities.add') && !readOnly;

  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [completing, setCompleting] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isPromptingCancel, setIsPromptingCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemId = item?.id;
  const itemStatus = item?.status;
  const itemTime = item?.scheduledAt;
  const isFollowUp = item?.kind === 'FOLLOW_UP';
  const open = itemStatus === 'SCHEDULED' || itemStatus === 'CONFIRMED';

  // A follow-up's actions work on the follow-up itself, which carries the rest of what they need.
  useEffect(() => {
    setFollowUp(null);
    setError(null);
    setIsPromptingCancel(false);
    setCancelReason('');
    if (!isOpen || !itemId || !isFollowUp || !tenantSlug || !canManageFollowUps || !open) return;
    let current = true;
    followUpService
      .get(tenantSlug, itemId)
      .then((loaded) => current && setFollowUp(loaded))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [isOpen, itemId, itemStatus, itemTime, isFollowUp, tenantSlug, canManageFollowUps, open]);

  if (!item) return null;
  const Icon = typeIcon(item.type);

  const done = (message?: string) => {
    if (message) toast.success(message);
    setCompleting(false);
    setRescheduling(false);
    setCancelling(false);
    setIsPromptingCancel(false);
    if (isFollowUp) followUpsChanged();
    onChanged();
    onClose();
  };

  const complete = async () => {
    if (!tenantSlug) return;
    // The activity needs the company's contacts (FR-ACT-02).
    try {
      const client = await clientService.getClient(tenantSlug, item.clientId);
      setContacts((client.contacts ?? []).map(({ id, name }) => ({ id, name })));
    } catch {
      setContacts([]);
    }
    setCompleting(true);
  };

  /** `stayOpen`: a status change leaves the panel on screen, showing the new status once the owner has reloaded. */
  const run = async (work: () => Promise<unknown>, message?: string, stayOpen = false) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      if (stayOpen) {
        if (message) toast.success(message);
        onChanged();
      } else {
        done(message);
      }
    } catch (failure: any) {
      setError(failure?.response?.data?.error ?? t('plan.errors.failed'));
    } finally {
      setBusy(false);
    }
  };

  const range = item.endAt ? `${dates.time(item.scheduledAt)} – ${dates.time(item.endAt)}` : dates.time(item.scheduledAt);

  const plannedActions = canPlan && !isFollowUp && open && (
    <>
      {item.status === 'SCHEDULED' && (
        <Button icon={<Check size={18} />} fullWidth onClick={() => run(() => appointmentService.updateAppointmentStatus(tenantSlug!, item.id, { status: 'CONFIRMED' }), undefined, true)} disabled={busy}>
          {t('detail.markConfirmed')}
        </Button>
      )}
      {item.status === 'CONFIRMED' && (
        <Button icon={<CheckCircle2 size={18} />} fullWidth onClick={() => run(() => appointmentService.updateAppointmentStatus(tenantSlug!, item.id, { status: 'COMPLETED' }), t('detail.completedDone'), true)} disabled={busy}>
          {t('detail.markCompleted')}
        </Button>
      )}
      <div className={styles.footerSecondary}>
        <Button variant="outline" icon={<Edit size={16} />} onClick={() => onEdit?.(item)}>
          {t('detail.edit')}
        </Button>
        <Button variant="outline" icon={<RefreshCw size={16} />} onClick={() => setRescheduling(true)}>
          {t('detail.reschedule')}
        </Button>
        <Button variant="outline" icon={<XCircle size={16} />} className={styles.cancelButton} onClick={() => setIsPromptingCancel(true)}>
          {t('detail.cancel')}
        </Button>
      </div>
    </>
  );

  const followUpActions = canManageFollowUps && isFollowUp && open && (
    <>
      <Button icon={<CheckCircle2 size={18} />} fullWidth onClick={complete} disabled={!followUp || busy}>
        {t('detail.complete')}
      </Button>
      <div className={styles.footerSecondary}>
        <Button variant="outline" icon={<RefreshCw size={16} />} onClick={() => setRescheduling(true)} disabled={!followUp}>
          {t('detail.reschedule')}
        </Button>
        <Button variant="outline" icon={<XCircle size={16} />} className={styles.cancelButton} onClick={() => setCancelling(true)} disabled={!followUp}>
          {t('detail.cancel')}
        </Button>
      </div>
    </>
  );

  return (
    <>
      <SlideOver
        isOpen={isOpen}
        onClose={onClose}
        title={t('detail.title')}
        footer={
          <div className={styles.footerActions}>
            {error && (
              <p role="alert" className={styles.refCode}>
                {error}
              </p>
            )}
            {isPromptingCancel ? (
              <div className={styles.cancelPrompt}>
                <TextInput placeholder={t('detail.cancelReasonPlaceholder')} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} autoFocus />
                <div className={styles.cancelPromptButtons}>
                  <Button variant="outline" onClick={() => setIsPromptingCancel(false)}>
                    {t('detail.back')}
                  </Button>
                  <Button
                    className={styles.cancelConfirmBtn}
                    onClick={() => run(() => appointmentService.cancelAppointment(tenantSlug!, item.id, { reason: cancelReason.trim() }), t('detail.cancelledDone'))}
                    disabled={!cancelReason.trim() || busy}
                  >
                    {busy ? t('detail.cancelling') : t('detail.confirmCancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {plannedActions}
                {followUpActions}
              </>
            )}
          </div>
        }
      >
        <div className={styles.panelContent}>
          <div className={styles.statusRow}>
            <Badge variant={statusToken(item.status) as any} className={styles.statusBadge}>
              <span className={styles.pulseDot}></span>
              {statusLabel.appointment(item.status)}
            </Badge>
            {item.isOverdue && <Badge variant="error">{t('calendar.overdue.tag')}</Badge>}
            <span className={styles.refCode}>{t(`calendar.kind.${item.kind}`)}</span>
          </div>

          <div className={styles.section}>
            <label className={styles.sectionLabel}>{t('detail.type')}</label>
            <div className={styles.infoRow}>
              <Icon size={18} className={styles.infoIcon} />
              <span className={styles.infoText}>{t(`calendar.type.${item.type}`)}</span>
            </div>
          </div>

          <div className={styles.section}>
            <label className={styles.sectionLabel}>{t('detail.company')}</label>
            <div className={styles.infoRow}>
              <Building2 size={18} className={styles.infoIcon} />
              <Link to={`/${tenantSlug}/clients/${item.clientId}`} className={styles.infoText}>
                {item.companyName}
              </Link>
            </div>
            {item.dealId && (
              <div className={styles.infoRow}>
                <Handshake size={18} className={styles.infoIcon} />
                <Link to={`/${tenantSlug}/deals/${item.dealId}`} className={styles.infoText}>
                  {dealText.title({ title: item.dealTitle, companyName: item.companyName, type: (item.dealType ?? 'NEW_CONTRACT') as DealType })}
                </Link>
              </div>
            )}
            {item.contactName && (
              <div className={styles.infoRow}>
                <User size={18} className={styles.infoIcon} />
                <span className={styles.infoText}>{item.contactName}</span>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <label className={styles.sectionLabel}>{t('detail.staffMember')}</label>
            <div className={styles.staffRow}>
              <p className={styles.staffName}>{item.assignedUserName || t('detail.unassigned')}</p>
            </div>
          </div>

          <div className={styles.dateTimeGrid}>
            <div className={styles.section}>
              <label className={styles.sectionLabel}>{t('detail.date')}</label>
              <div className={styles.infoRow}>
                <Calendar size={18} className={styles.infoIcon} />
                <span className={styles.infoText}>{dates.dateMedium(item.scheduledAt)}</span>
              </div>
            </div>
            <div className={styles.section}>
              <label className={styles.sectionLabel}>{t('detail.time')}</label>
              <div className={styles.infoRow}>
                <Clock size={18} className={styles.infoIcon} />
                <span className={styles.infoText}>{range}</span>
              </div>
            </div>
          </div>

          {item.place && (
            <div className={styles.section}>
              <label className={styles.sectionLabel}>{t('detail.place')}</label>
              <div className={styles.infoRow}>
                <MapPin size={18} className={styles.infoIcon} />
                <span className={styles.infoText}>{item.place}</span>
              </div>
            </div>
          )}

          <div className={styles.section}>
            <label className={styles.sectionLabel}>{t('detail.notes')}</label>
            <div className={styles.purposeCard}>
              <p className={styles.purposeDesc}>{item.notes || t('detail.noNotes')}</p>
            </div>
          </div>
        </div>
      </SlideOver>

      {canManageFollowUps && isFollowUp && (
        <>
          <ActivityDialog
            isOpen={completing}
            onClose={() => setCompleting(false)}
            clientId={item.clientId}
            contacts={contacts}
            completing={followUp}
            onSaved={() => done(t('detail.followUpCompleted'))}
          />
          <RescheduleFollowUpModal followUp={rescheduling ? followUp : null} onClose={() => setRescheduling(false)} onDone={() => done()} />
          <CancelFollowUpModal followUp={cancelling ? followUp : null} onClose={() => setCancelling(false)} onDone={() => done()} />
        </>
      )}
      {canPlan && !isFollowUp && <RescheduleItemDialog item={rescheduling ? item : null} onClose={() => setRescheduling(false)} onDone={() => done()} />}
    </>
  );
};
