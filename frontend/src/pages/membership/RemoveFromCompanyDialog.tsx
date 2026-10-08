import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button/Button';
import { Modal } from '../../components/ui/Modal/Modal';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { memberService, refusedField } from '../../services/memberService';
import styles from './Members.module.css';

interface Props {
  tenantSlug: string;
  /** One member from the member page, or the selection on the company tab (FR-EMP-12, FR-EMP-15). */
  memberIds: string[];
  companyName: string | null;
  onClose: () => void;
  onDone: () => void;
}

const todayKey = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

type Field = 'leftOn' | 'reason' | 'failed' | 'notEmployee';

/**
 * Remove employees from their company (FR-EMP-12, FR-EMP-15): the leaving date, today by default and never in the future,
 * and an optional reason. The server clears the link, ends the sponsored term and works out the tier; this dialog only
 * asks. Several members go in one request, so all are removed or none.
 */
export const RemoveFromCompanyDialog: React.FC<Props> = ({ tenantSlug, memberIds, companyName, onClose, onDone }) => {
  const { t } = useTranslation('members');
  const [leftOn, setLeftOn] = useState(todayKey());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<Field | null>(null);
  const [saving, setSaving] = useState(false);
  const many = memberIds.length > 1;

  const confirm = async () => {
    if (leftOn === '' || leftOn > todayKey()) return setError('leftOn');
    const body = { leftOn, ...(reason.trim() ? { reason: reason.trim() } : {}) };
    setSaving(true);
    try {
      if (many) await memberService.removeEmployees(tenantSlug, memberIds, body);
      else await memberService.removeEmployer(tenantSlug, memberIds[0], body);
      onDone();
    } catch (err) {
      const response = (err as { response?: { status?: number; data?: { code?: string } } })?.response;
      const field = refusedField(err);
      if (response?.status === 409 && response.data?.code === 'NOT_AN_EMPLOYEE') setError('notEmployee');
      else setError(field === 'endsOn' ? 'leftOn' : field === 'reason' ? 'reason' : 'failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={t(many ? 'removeEmployer.titleMany' : 'removeEmployer.title')}>
      <div className={styles.modalBody}>
        <p>{many ? t('removeEmployer.helpMany', { count: memberIds.length }) : t('removeEmployer.help', { company: companyName ?? '' })}</p>
        <TextInput
          label={t('removeEmployer.leftOn')}
          type="date"
          value={leftOn}
          max={todayKey()}
          onChange={(e) => {
            setLeftOn(e.target.value);
            setError(null);
          }}
          error={error === 'leftOn' ? t('removeEmployer.leftOnInvalid') : undefined}
        />
        <TextareaInput
          label={t('removeEmployer.reason')}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
          rows={3}
          error={error === 'reason' ? t('removeEmployer.reasonInvalid') : undefined}
        />
        {(error === 'failed' || error === 'notEmployee') && (
          <p className={styles.formError} role="alert">{t(error === 'notEmployee' ? 'removeEmployer.notEmployee' : 'removeEmployer.failed')}</p>
        )}
        <div className={styles.modalActions}>
          <Button variant="ghost" onClick={onClose}>{t('removeEmployer.cancel')}</Button>
          <Button variant="danger" isLoading={saving} onClick={() => void confirm()}>{t('removeEmployer.confirm')}</Button>
        </div>
      </div>
    </Modal>
  );
};
