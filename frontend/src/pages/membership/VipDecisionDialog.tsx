import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button/Button';
import { Modal } from '../../components/ui/Modal/Modal';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { memberVipService, vipRefusalOf } from '../../services/memberVipService';
import type { VipRequest } from '../../services/memberService';
import styles from './Members.module.css';

interface Props {
  tenantSlug: string;
  request: VipRequest;
  decision: 'APPROVE' | 'REJECT';
  onClose: () => void;
  onDone: () => void;
}

/**
 * Approve or reject a VIP request (FR-VIP-02). A rejection needs a reason; an approval takes an optional note. The
 * term, its dates and the review date are made by the server, and the dialog only says what will happen.
 */
export const VipDecisionDialog: React.FC<Props> = ({ tenantSlug, request, decision, onClose, onDone }) => {
  const { t } = useTranslation('members');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const reject = decision === 'REJECT';

  const confirm = async () => {
    if (reject && note.trim() === '') return setError('reason');
    setSaving(true);
    try {
      await memberVipService.decide(tenantSlug, request.id, decision, note.trim() || undefined);
      onDone();
    } catch (err) {
      const refusal = vipRefusalOf(err);
      setError(refusal ? `refused.${refusal}` : 'failed');
    } finally {
      setSaving(false);
    }
  };

  const errorText = (key: string) => (key === 'reason' ? t('vip.decide.reasonRequired') : key.startsWith('refused.') ? t(`vip.${key}`) : t('vip.decide.failed'));

  return (
    <Modal isOpen onClose={onClose} title={t(reject ? 'vip.decide.rejectTitle' : 'vip.decide.approveTitle', { name: request.member.name })}>
      <div className={styles.modalBody}>
        <p>{t(reject ? 'vip.decide.rejectHelp' : 'vip.decide.approveHelp')}</p>
        <p className={styles.muted}>{t('vip.decide.requestedWith', { reason: request.reason })}</p>
        <TextareaInput
          label={t(reject ? 'vip.decide.rejectReason' : 'vip.decide.note')}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setError(null);
          }}
          rows={3}
          error={error === 'reason' ? errorText('reason') : undefined}
        />
        {error && error !== 'reason' && <p className={styles.formError} role="alert">{errorText(error)}</p>}
        <div className={styles.modalActions}>
          <Button variant="ghost" onClick={onClose}>{t('vip.decide.cancel')}</Button>
          <Button variant={reject ? 'danger' : 'primary'} isLoading={saving} onClick={() => void confirm()}>
            {t(reject ? 'vip.decide.reject' : 'vip.decide.approve')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
