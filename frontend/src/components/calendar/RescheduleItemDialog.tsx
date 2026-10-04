import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Modal } from '../ui/Modal/Modal';
import { Button } from '../ui/Button/Button';
import { TextInput } from '../ui/TextInput/TextInput';
import { TextareaInput } from '../ui/TextareaInput/TextareaInput';
import { useToast } from '../ui/Toast/toastContext';
import { useDateFormat } from '../../hooks/useDateFormat';
import { appointmentService } from '../../services/appointmentService';
import { instantAtMinutes, minutesIntoDay } from '../../utils/calendarDays';
import type { CalendarItem } from '../../types/calendar';
import styles from './PlanActivityDialog.module.css';

const toClock = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * FR-CAL-07, the keyboard and touch way to what a drag does: a new day and
 * start for a planned item. Its end moves with it, so it keeps its length;
 * the previous time stays in its history. (A follow-up has its own dialog.)
 */
export const RescheduleItemDialog: React.FC<{ item: CalendarItem | null; onClose: () => void; onDone: () => void }> = ({ item, onClose, onDone }) => {
  const { t } = useTranslation('appointments');
  const { tenantSlug } = useParams();
  const toast = useToast();
  const dates = useDateFormat();
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setDay(dates.dayKey(item.scheduledAt));
    setTime(toClock(minutesIntoDay(item.scheduledAt, dates.timeZone)));
    setReason('');
    setError(null);
    // The form opens on the item; typing must not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const save = async () => {
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    if (!tenantSlug || !item) return;
    if (!day || !match) {
      setError(t('plan.errors.date'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const newDate = instantAtMinutes(day, Number(match[1]) * 60 + Number(match[2]), dates.timeZone).toISOString();
      await appointmentService.rescheduleAppointment(tenantSlug, item.id, { newDate, reason: reason.trim() });
      toast.success(t('reschedule.done'));
      onDone();
    } catch (failure: any) {
      setError(failure?.response?.data?.error ?? t('plan.errors.failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={!!item} onClose={onClose} title={t('reschedule.title')} maxWidth="sm">
      <div className={styles.form}>
        <div className={styles.row}>
          <TextInput type="date" label={t('plan.date')} value={day} onChange={(event) => setDay(event.target.value)} required />
          <TextInput type="time" label={t('plan.start')} value={time} onChange={(event) => setTime(event.target.value)} required />
        </div>
        <TextareaInput label={t('reschedule.reason')} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose}>
            {t('plan.cancel')}
          </Button>
          <Button onClick={save} isLoading={saving} disabled={!day || !time}>
            {t('reschedule.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
