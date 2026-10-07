import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button/Button';
import { Modal } from '../../components/ui/Modal/Modal';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { dayAsDate } from '../../components/calendar/calendarGrouping';
import {
  memberPaymentService,
  PAYMENT_METHODS,
  refusalOf,
  type PaymentMethod,
  type PaymentOption,
} from '../../services/memberPaymentService';
import { refusedField } from '../../services/memberService';
import { useTierLabels } from './useTierLabels';
import styles from './Members.module.css';

interface Props {
  tenantSlug: string;
  memberId: string;
  isOpen: boolean;
  onClose: () => void;
  onRecorded: () => void;
}

const keyOf = (option: Pick<PaymentOption, 'kind' | 'targetTier'>) => `${option.kind}:${option.targetTier}`;

/**
 * Record a membership payment (FR-MPAY-01). The agent chooses one of the payments the server says this member can
 * make, the method and the date received; the server's quote shows the list fee, any family discount, the amount
 * and the new term dates. There is no amount field: the number on the screen is the one the server calculated and
 * will calculate again when it saves (FR-MPAY-02).
 */
export const RecordPaymentModal: React.FC<Props> = ({ tenantSlug, memberId, isOpen, onClose, onRecorded }) => {
  const { t } = useTranslation('members');
  const dates = useDateFormat();
  const { format: formatMoney } = useMoneyFormat();
  const tier = useTierLabels(tenantSlug);
  const today = dates.dayKey(new Date());

  const [receivedOn, setReceivedOn] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const [options, setOptions] = useState<PaymentOption[] | null>(null);
  const [chosen, setChosen] = useState('');
  const [loadError, setLoadError] = useState<'failed' | 'date' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Every date asks the server again: the price, the discount and the term dates all depend on the payment date.
  useEffect(() => {
    if (!isOpen) return;
    let live = true;
    setLoadError(null);
    memberPaymentService.options(tenantSlug, memberId, receivedOn).then(
      (rows) => {
        if (!live) return;
        setOptions(rows);
        setChosen((current) => (rows.some((r) => keyOf(r) === current) ? current : rows[0] ? keyOf(rows[0]) : ''));
      },
      (err) => {
        if (!live) return;
        setOptions(null);
        setLoadError(refusedField(err) === 'receivedOn' ? 'date' : 'failed');
      }
    );
    return () => {
      live = false;
    };
  }, [isOpen, tenantSlug, memberId, receivedOn]);

  const option = options?.find((o) => keyOf(o) === chosen) ?? null;
  const day = (key: string) => dates.date(dayAsDate(key));

  const save = async () => {
    if (!option) return;
    setSaving(true);
    setSaveError(null);
    try {
      await memberPaymentService.record(tenantSlug, memberId, {
        kind: option.kind,
        targetTier: option.targetTier,
        method,
        receivedOn,
        note: note.trim() || null,
      });
      setNote('');
      onRecorded();
    } catch (err) {
      const refusal = refusalOf(err);
      setSaveError(refusal ? `refused.${refusal}` : 'failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('payments.drawer.title')}>
      <div className={styles.modalBody}>
        <TextInput
          label={t('payments.drawer.receivedOn')}
          type="date"
          value={receivedOn}
          max={today}
          onChange={(e) => setReceivedOn(e.target.value || today)}
          error={loadError === 'date' ? t('payments.drawer.dateRefused') : undefined}
        />

        {options !== null && options.length === 0 && <p role="status">{t('payments.drawer.noOptions')}</p>}
        {loadError === 'failed' && <p className={styles.formError} role="alert">{t('payments.drawer.loadFailed')}</p>}

        {options !== null && options.length > 0 && (
          <SelectInput label={t('payments.drawer.option')} value={chosen} onChange={(e) => setChosen(e.target.value)}>
            {options.map((o) => (
              <option key={keyOf(o)} value={keyOf(o)}>
                {t('payments.drawer.optionLabel', { kind: t(`payments.kind.${o.kind}`), tier: tier(o.targetTier).label })}
              </option>
            ))}
          </SelectInput>
        )}

        {option && (
          <>
            <dl className={styles.facts} aria-label={t('payments.drawer.quote')}>
              <div className={styles.fact}>
                <dt>{t('payments.drawer.listFee')}</dt>
                <dd>{formatMoney(option.quote.listFee)}</dd>
              </div>
              {Number(option.quote.discountPercent) > 0 && (
                <div className={styles.fact}>
                  <dt>{t('payments.drawer.discount')}</dt>
                  <dd>{option.quote.discountPercent}%</dd>
                </div>
              )}
              <div className={styles.fact}>
                <dt>{t('payments.drawer.amount')}</dt>
                <dd><strong data-testid="payment-amount">{formatMoney(option.quote.amount)}</strong></dd>
              </div>
              <div className={styles.fact}>
                <dt>{t('payments.drawer.newTerm')}</dt>
                <dd>{t('payments.drawer.term', { from: day(option.quote.startsOn), to: day(option.quote.endsOn) })}</dd>
              </div>
            </dl>
            <p className={styles.muted}>{t('payments.drawer.calculated')}</p>
            {option.quote.warnings.map((warning) => (
              <p key={warning} className={styles.warning} role="note">{t(`payments.warning.${warning}`)}</p>
            ))}
          </>
        )}

        <SelectInput label={t('payments.drawer.method')} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {PAYMENT_METHODS.map((value) => (
            <option key={value} value={value}>{t(`payments.method.${value}`)}</option>
          ))}
        </SelectInput>
        <TextareaInput label={t('payments.drawer.note')} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />

        {saveError && <p className={styles.formError} role="alert">{t(`payments.drawer.${saveError}`)}</p>}
        <div className={styles.modalActions}>
          <Button variant="ghost" onClick={onClose}>{t('payments.drawer.cancel')}</Button>
          <Button isLoading={saving} disabled={!option} onClick={() => void save()}>{t('payments.drawer.save')}</Button>
        </div>
      </div>
    </Modal>
  );
};
