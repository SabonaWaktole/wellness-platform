import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Modal } from '../ui/Modal/Modal';
import { Button } from '../ui/Button/Button';
import { SelectInput } from '../ui/SelectInput/SelectInput';
import { TextInput } from '../ui/TextInput/TextInput';
import { TextareaInput } from '../ui/TextareaInput/TextareaInput';
import { useDateFormat } from '../../hooks/useDateFormat';
import { followUpService } from '../../services/followUpService';
import { FOLLOW_UP_TYPES, type FollowUp, type FollowUpType } from '../../types/followUp';
import { followUpErrorField, followUpErrorMessage } from './followUpErrors';
import styles from './FollowUps.module.css';

/** The time a follow-up is due at unless the user changes it (FR-FUP-02). */
export const DEFAULT_FOLLOW_UP_TIME = '09:00';

/**
 * "Custom date" (FR-FUP-01, 02): a day and a time in the workspace's time
 * zone, the type of contact (default Call) and a short note. Left empty, the
 * note takes the activity's next action when there is one.
 */
export const ScheduleFollowUpModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  dealId?: string | null;
  fromActivityId?: string | null;
  onScheduled: (followUp: FollowUp) => void;
}> = ({ isOpen, onClose, clientId, dealId, fromActivityId, onScheduled }) => {
  const { t } = useTranslation('followUps');
  const { tenantSlug } = useParams();
  const dates = useDateFormat();
  const [day, setDay] = useState('');
  const [time, setTime] = useState(DEFAULT_FOLLOW_UP_TIME);
  const [type, setType] = useState<FollowUpType>('CALL');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // Tomorrow, in the workspace's zone.
    setDay(dates.dayKey(dates.dayBounds(1).start));
    setTime(DEFAULT_FOLLOW_UP_TIME);
    setType('CALL');
    setNote('');
    setErrors({});
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const save = async () => {
    if (!tenantSlug) return;
    if (!day) {
      setErrors({ dueDate: t('errors.dueDate') });
      return;
    }
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      onScheduled(
        await followUpService.schedule(tenantSlug, {
          clientId,
          dealId: dealId ?? undefined,
          fromActivityId,
          dueDate: day,
          time: time || DEFAULT_FOLLOW_UP_TIME,
          type,
          // Left out, the server takes the activity's next action.
          ...(note.trim() || !fromActivityId ? { note: note.trim() || null } : {}),
        })
      );
    } catch (error) {
      const field = followUpErrorField(error);
      const message = followUpErrorMessage(error, t);
      if (field === 'dueAt' || field === 'dueDate') setErrors({ dueDate: message });
      else if (field === 'time' || field === 'note') setErrors({ [field]: message });
      else setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('form.title')} maxWidth="sm">
      <div className={styles.form}>
        {formError && (
          <p className={styles.formError} role="alert">
            {formError}
          </p>
        )}
        <div className={styles.row}>
          <TextInput type="date" label={t('form.date')} value={day} onChange={(event) => setDay(event.target.value)} error={errors.dueDate} required />
          <TextInput type="time" label={t('form.time')} value={time} onChange={(event) => setTime(event.target.value)} error={errors.time} />
        </div>
        <SelectInput label={t('form.type')} value={type} onChange={(event) => setType(event.target.value as FollowUpType)}>
          {FOLLOW_UP_TYPES.map((candidate) => (
            <option key={candidate} value={candidate}>
              {t(`type.${candidate}`)}
            </option>
          ))}
        </SelectInput>
        <TextareaInput label={t('form.note')} rows={2} value={note} onChange={(event) => setNote(event.target.value)} error={errors.note} />
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose}>
            {t('form.cancel')}
          </Button>
          <Button onClick={save} isLoading={saving}>
            {t('form.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
