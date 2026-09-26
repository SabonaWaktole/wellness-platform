import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card/Card';
import { Button } from '../../components/ui/Button/Button';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { useContracts, useContractActions } from '../../hooks/useContracts';
import { useClients } from '../../hooks/useClients';
import { useTeam } from '../../hooks/useTeam';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { getStaffDisplayName } from '../../utils/userUtils';
import { BillingPeriod } from '../../types/contract';
import { buildPaymentSchedule } from '../../utils/paymentSchedule';
import styles from './ContractDetailContent.module.css';

const BILLING_PERIODS: BillingPeriod[] = ['MONTHLY', 'QUARTERLY', 'ANNUAL', 'ONE_TIME'];

const BILLING_PERIOD_LABEL_KEY: Record<BillingPeriod, string> = {
  MONTHLY: 'billingPeriod.monthly',
  QUARTERLY: 'billingPeriod.quarterly',
  ANNUAL: 'billingPeriod.annual',
  ONE_TIME: 'billingPeriod.oneTime',
};

interface FormState {
  clientId: string;
  planName: string;
  amount: string;
  billingPeriod: BillingPeriod;
  startsAt: string;
  endsAt: string;
  assignedUserId: string;
  notes: string;
}

const emptyForm: FormState = {
  clientId: '',
  planName: '',
  amount: '',
  billingPeriod: 'MONTHLY',
  startsAt: '',
  endsAt: '',
  assignedUserId: '',
  notes: '',
};

const toDateInput = (value: string): string => new Date(value).toISOString().slice(0, 10);

/**
 * Create and edit share one component because the two forms are the same form.
 * The only differences are which fields are locked (the client cannot move
 * after creation — a contract belongs to the business that signed it) and
 * which endpoint the submit hits.
 */
export const ContractFormContent: React.FC = () => {
  const { t } = useTranslation('contracts');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const { tenantSlug, contractId } = useParams();
  const [searchParams] = useSearchParams();
  const { format: formatMoney } = useMoneyFormat();

  const isEdit = Boolean(contractId);

  const { fetchContractDetail } = useContracts();
  const actions = useContractActions();
  const { clients, fetchClients } = useClients();
  const { staff, fetchStaff } = useTeam();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    // A generous page size rather than a search box: a business selling
    // subscriptions has a client list in the hundreds, not the millions, and a
    // picker that cannot find a client is worse than a long list.
    fetchClients({ take: 200 });
    fetchStaff();
  }, [fetchClients, fetchStaff]);

  useEffect(() => {
    if (!contractId) {
      // Pre-selected client when arriving from the client page's Contracts tab.
      const preset = searchParams.get('clientId');
      if (preset) setForm((current) => ({ ...current, clientId: preset }));
      return;
    }

    fetchContractDetail(contractId)
      .then(({ contract }) => {
        setForm({
          clientId: contract.clientId,
          planName: contract.planName,
          amount: String(contract.amount),
          billingPeriod: contract.billingPeriod,
          startsAt: toDateInput(contract.startsAt),
          endsAt: toDateInput(contract.endsAt),
          assignedUserId: contract.assignedUserId ?? '',
          notes: contract.notes ?? '',
        });
      })
      .catch((error) => console.error('Failed to load contract', error));
  }, [contractId, fetchContractDetail, searchParams]);

  /**
   * Live preview of what activation will schedule.
   *
   * Uses the same generator as the backend so the number shown here and the
   * number of rows created are the same fact, not two implementations that
   * happen to agree today.
   */
  const preview = useMemo(() => {
    const amount = Number(form.amount);
    if (!form.startsAt || !form.endsAt || !Number.isFinite(amount)) return null;

    const startsAt = new Date(form.startsAt);
    const endsAt = new Date(form.endsAt);
    if (endsAt < startsAt) return null;

    return buildPaymentSchedule({
      billingPeriod: form.billingPeriod,
      amount,
      startsAt,
      endsAt,
    });
  }, [form.amount, form.billingPeriod, form.startsAt, form.endsAt]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (!isEdit && !form.clientId) next.clientId = t('form.required');
    if (!form.planName.trim()) next.planName = t('form.required');
    if (form.amount === '') next.amount = t('form.required');
    if (!form.startsAt) next.startsAt = t('form.required');
    if (!form.endsAt) next.endsAt = t('form.required');

    if (form.startsAt && form.endsAt && new Date(form.endsAt) < new Date(form.startsAt)) {
      next.endsAt = t('form.endBeforeStart');
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    const payload = {
      planName: form.planName.trim(),
      amount: Number(form.amount),
      billingPeriod: form.billingPeriod,
      startsAt: form.startsAt,
      endsAt: form.endsAt,
      assignedUserId: form.assignedUserId || null,
      notes: form.notes || null,
    };

    try {
      if (isEdit && contractId) {
        const result = await actions.updateContract(contractId, payload);
        navigate(`/${tenantSlug}/contracts/${contractId}`, {
          // Carried as route state rather than refetched: only the response to
          // THIS update knows whether the price moved away from instalments
          // that are already scheduled.
          state: { scheduleNeedsReview: result.scheduleNeedsReview },
        });
      } else {
        const created = await actions.createContract({ ...payload, clientId: form.clientId });
        navigate(`/${tenantSlug}/contracts/${created.id}`);
      }
    } catch (error: any) {
      setSubmitError(error?.response?.data?.error ?? tc('state.error'));
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('breadcrumb')}</div>
          <h1 className={styles.title}>{isEdit ? t('form.editTitle') : t('form.createTitle')}</h1>
        </div>
      </div>

      <Card padding="lg">
        <form onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            <div className={styles.formGridFull}>
              <SelectInput
                label={t('form.client')}
                value={form.clientId}
                error={errors.clientId}
                // The client is fixed once the contract exists: moving a signed
                // term to a different business would rewrite who owes the money.
                disabled={isEdit}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              >
                <option value="">{t('form.clientPlaceholder')}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </SelectInput>
            </div>

            <TextInput
              label={t('form.planName')}
              placeholder={t('form.planNamePlaceholder')}
              value={form.planName}
              error={errors.planName}
              onChange={(e) => setForm({ ...form, planName: e.target.value })}
            />

            <TextInput
              label={t('form.amount')}
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              error={errors.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />

            <SelectInput
              label={t('form.billingPeriod')}
              value={form.billingPeriod}
              onChange={(e) =>
                setForm({ ...form, billingPeriod: e.target.value as BillingPeriod })
              }
            >
              {BILLING_PERIODS.map((period) => (
                <option key={period} value={period}>
                  {t(BILLING_PERIOD_LABEL_KEY[period])}
                </option>
              ))}
            </SelectInput>

            <SelectInput
              label={t('form.assignedUserId')}
              value={form.assignedUserId}
              onChange={(e) => setForm({ ...form, assignedUserId: e.target.value })}
            >
              <option value="">{tc('action.select')}</option>
              {staff.map((person: any) => (
                <option key={person.id} value={person.id}>
                  {getStaffDisplayName(person)}
                </option>
              ))}
            </SelectInput>

            <TextInput
              label={t('form.startsAt')}
              type="date"
              value={form.startsAt}
              error={errors.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />

            <TextInput
              label={t('form.endsAt')}
              type="date"
              value={form.endsAt}
              error={errors.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            />

            <div className={styles.formGridFull}>
              <TextareaInput
                label={t('form.notes')}
                placeholder={t('form.notesPlaceholder')}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          {preview && preview.length > 0 && (
            <p className={styles.notesEmpty}>
              {t('form.termPreview', {
                count: preview.length,
                amount: formatMoney(preview[0].amount),
              })}
            </p>
          )}

          {submitError && (
            <div className={styles.warningBanner}>
              <span>{submitError}</span>
            </div>
          )}

          <div className={styles.modalActions}>
            <Button variant="outline" type="button" onClick={() => navigate(-1)}>
              {t('form.cancel')}
            </Button>
            <Button variant="primary" type="submit" disabled={actions.loading}>
              {isEdit ? t('form.submitEdit') : t('form.submitCreate')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
