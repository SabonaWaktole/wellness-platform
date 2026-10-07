import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button/Button';
import { Modal } from '../../components/ui/Modal/Modal';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { memberService, refusedField } from '../../services/memberService';
import styles from './Members.module.css';

interface Props {
  tenantSlug: string;
  memberId: string;
  /** The tier labels the workspace set (FR-SET-06), for the two tiers a correction can grant. */
  tierLabel: (tier: 'SILVER' | 'GOLD') => string;
  onClose: () => void;
  onDone: () => void;
}

type Field = 'tier' | 'endsOn' | 'reason' | 'failed';

/**
 * Correct a member's tier (FR-TIR-09, "Wellness+ settings: manage"): a tier, an end date and a required reason.
 * The server makes the term, from today to the end date, and writes the history and the audit entry; this dialog
 * only checks that nothing is empty before it asks.
 */
export const CorrectTierDialog: React.FC<Props> = ({ tenantSlug, memberId, tierLabel, onClose, onDone }) => {
  const { t } = useTranslation('members');
  const [tier, setTier] = useState<'SILVER' | 'GOLD'>('GOLD');
  const [endsOn, setEndsOn] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<Field | null>(null);
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    if (endsOn === '') return setError('endsOn');
    if (reason.trim() === '') return setError('reason');
    setSaving(true);
    try {
      await memberService.correctTier(tenantSlug, memberId, { tier, endsOn, reason: reason.trim() });
      onDone();
    } catch (err) {
      const field = refusedField(err);
      setError(field === 'endsOn' || field === 'reason' || field === 'tier' ? field : 'failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={t('detail.correctTier.title')}>
      <div className={styles.modalBody}>
        <p>{t('detail.correctTier.help')}</p>
        <SelectInput label={t('detail.correctTier.tier')} value={tier} onChange={(e) => setTier(e.target.value as 'SILVER' | 'GOLD')}>
          <option value="SILVER">{tierLabel('SILVER')}</option>
          <option value="GOLD">{tierLabel('GOLD')}</option>
        </SelectInput>
        <TextInput
          label={t('detail.correctTier.endsOn')}
          type="date"
          value={endsOn}
          onChange={(e) => {
            setEndsOn(e.target.value);
            setError(null);
          }}
          error={error === 'endsOn' ? t('detail.correctTier.endsOnInvalid') : undefined}
        />
        <TextareaInput
          label={t('detail.correctTier.reason')}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
          rows={3}
          error={error === 'reason' ? t('detail.correctTier.reasonRequired') : undefined}
        />
        {(error === 'failed' || error === 'tier') && <p className={styles.formError} role="alert">{t('detail.correctTier.failed')}</p>}
        <div className={styles.modalActions}>
          <Button variant="ghost" onClick={onClose}>{t('detail.correctTier.cancel')}</Button>
          <Button isLoading={saving} onClick={() => void confirm()}>{t('detail.correctTier.confirm')}</Button>
        </div>
      </div>
    </Modal>
  );
};
