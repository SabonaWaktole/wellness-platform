import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Modal } from '../ui/Modal/Modal';
import { Button } from '../ui/Button/Button';
import { SelectInput } from '../ui/SelectInput/SelectInput';
import { TextInput } from '../ui/TextInput/TextInput';
import { TextareaInput } from '../ui/TextareaInput/TextareaInput';
import { useToast } from '../ui/Toast/toastContext';
import { useDateFormat } from '../../hooks/useDateFormat';
import { followUpService } from '../../services/followUpService';
import type { FollowUp } from '../../types/followUp';
import type { StaffMember } from '../../hooks/useTeam';
import { getStaffDisplayName } from '../../utils/userUtils';
import { followUpErrorField, followUpErrorMessage } from './followUpErrors';
import { DEFAULT_FOLLOW_UP_TIME } from './ScheduleFollowUpModal';
import styles from './FollowUps.module.css';

interface ActionModalProps {
  followUp: FollowUp | null;
  onClose: () => void;
  onDone: (followUp: FollowUp) => void;
}

/** FR-FUP-06: a new date and time; the previous one stays in the follow-up's history. */
export const RescheduleFollowUpModal: React.FC<ActionModalProps> = ({ followUp, onClose, onDone }) => {
  const { t } = useTranslation('followUps');
  const { tenantSlug } = useParams();
  const toast = useToast();
  const dates = useDateFormat();
  const [day, setDay] = useState('');
  const [time, setTime] = useState(DEFAULT_FOLLOW_UP_TIME);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!followUp) return;
    setDay(dates.dayKey(dates.dayBounds(1).start));
    setTime(DEFAULT_FOLLOW_UP_TIME);
    setReason('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followUp]);

  const save = async () => {
    if (!tenantSlug || !followUp) return;
    setSaving(true);
    setError(null);
    try {
      const moved = await followUpService.reschedule(tenantSlug, followUp.id, { dueDate: day, time: time || DEFAULT_FOLLOW_UP_TIME, reason: reason.trim() || null });
      toast.success(t('reschedule.done', { date: dates.dateTime(moved.scheduledAt) }));
      onDone(moved);
    } catch (failure) {
      setError(followUpErrorMessage(failure, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={!!followUp} onClose={onClose} title={t('reschedule.title')} maxWidth="sm">
      <div className={styles.form}>
        <div className={styles.row}>
          <TextInput type="date" label={t('form.date')} value={day} onChange={(event) => setDay(event.target.value)} required />
          <TextInput type="time" label={t('form.time')} value={time} onChange={(event) => setTime(event.target.value)} />
        </div>
        <TextareaInput label={t('reschedule.reason')} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
        {error && (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose}>
            {t('form.cancel')}
          </Button>
          <Button onClick={save} isLoading={saving} disabled={!day}>
            {t('reschedule.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

/** FR-FUP-06: cancelled with a reason. */
export const CancelFollowUpModal: React.FC<ActionModalProps> = ({ followUp, onClose, onDone }) => {
  const { t } = useTranslation('followUps');
  const { tenantSlug } = useParams();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReason('');
    setError(null);
  }, [followUp]);

  const save = async () => {
    if (!tenantSlug || !followUp) return;
    if (!reason.trim()) {
      setError(t('errors.reason'));
      return;
    }
    setSaving(true);
    try {
      const cancelled = await followUpService.cancel(tenantSlug, followUp.id, reason.trim());
      toast.success(t('cancel.done'));
      onDone(cancelled);
    } catch (failure) {
      setError(followUpErrorField(failure) === 'reason' ? t('errors.reason') : followUpErrorMessage(failure, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={!!followUp} onClose={onClose} title={t('cancel.title')} maxWidth="sm">
      <div className={styles.form}>
        <TextareaInput label={t('cancel.reason')} required rows={3} value={reason} onChange={(event) => setReason(event.target.value)} error={error ?? undefined} />
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel.keep')}
          </Button>
          <Button variant="danger" onClick={save} isLoading={saving}>
            {t('cancel.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

/** FR-FUP-10: the Sales Manager hands a follow-up to another salesperson. */
export const ReassignFollowUpModal: React.FC<ActionModalProps & { staff: StaffMember[] }> = ({ followUp, onClose, onDone, staff }) => {
  const { t } = useTranslation('followUps');
  const { tenantSlug } = useParams();
  const toast = useToast();
  const [assignee, setAssignee] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAssignee('');
    setError(null);
  }, [followUp]);

  const save = async () => {
    if (!tenantSlug || !followUp || !assignee) return;
    setSaving(true);
    setError(null);
    try {
      const moved = await followUpService.reassign(tenantSlug, followUp.id, assignee);
      toast.success(t('reassign.done', { name: moved.assignedUserName }));
      onDone(moved);
    } catch (failure) {
      setError(followUpErrorMessage(failure, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={!!followUp} onClose={onClose} title={t('reassign.title')} maxWidth="sm">
      <div className={styles.form}>
        <SelectInput label={t('reassign.label')} value={assignee} onChange={(event) => setAssignee(event.target.value)} error={error ?? undefined}>
          <option value="" disabled>
            —
          </option>
          {staff
            .filter((member) => member.isActive !== false && member.id !== followUp?.assignedUserId)
            .map((member) => (
              <option key={member.id} value={member.id}>
                {getStaffDisplayName(member)}
              </option>
            ))}
        </SelectInput>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose}>
            {t('form.cancel')}
          </Button>
          <Button onClick={save} isLoading={saving} disabled={!assignee}>
            {t('reassign.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
