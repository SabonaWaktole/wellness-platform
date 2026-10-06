import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { contractSettingsService, type ContractSettings } from '../../../services/contractSettingsService';
import styles from './ContractSettingsContent.module.css';

type Field = keyof ContractSettings;
type Draft = Record<Field, string>;

const FIELDS: Field[] = ['reminderLeadDays', 'expiringSoonDays', 'paymentGraceDays', 'numberPrefix'];

const toDraft = (settings: ContractSettings): Draft => ({
  reminderLeadDays: settings.reminderLeadDays.join(', '),
  expiringSoonDays: String(settings.expiringSoonDays),
  paymentGraceDays: String(settings.paymentGraceDays),
  numberPrefix: settings.numberPrefix,
});

/** "90, 30" → [90, 30]. Anything that is not a number stays NaN so the server refuses it with the field. */
const parseLeadDays = (text: string): number[] =>
  text
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number);

/**
 * Settings → Contracts and payments (M3 Slice 3: FR-REN-01, FR-REN-04,
 * FR-PAY-09, FR-CON-05). The server is the only judge of the values; the page
 * only shows its refusal against the field it names.
 */
export const ContractSettingsContent = () => {
  const { t } = useTranslation('settings');
  const { tenantSlug } = useParams();
  const [saved, setSaved] = useState<ContractSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fieldError, setFieldError] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    if (!tenantSlug) return;
    contractSettingsService
      .get(tenantSlug)
      .then((settings) => {
        setSaved(settings);
        setDraft(toDraft(settings));
      })
      .catch(() => setError(t('contractSettings.loadFailed')));
  }, [tenantSlug, t]);

  const edit = (field: Field, value: string) => {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
    setStatus('idle');
    setFieldError(null);
    setError(null);
  };

  const dirty = !!saved && !!draft && JSON.stringify(toDraft(saved)) !== JSON.stringify(draft);

  const save = async () => {
    if (!tenantSlug || !draft) return;
    setStatus('saving');
    setError(null);
    setFieldError(null);
    try {
      const next = await contractSettingsService.update(tenantSlug, {
        reminderLeadDays: parseLeadDays(draft.reminderLeadDays),
        expiringSoonDays: Number(draft.expiringSoonDays),
        paymentGraceDays: Number(draft.paymentGraceDays),
        numberPrefix: draft.numberPrefix.trim(),
      });
      setSaved(next);
      setDraft(toDraft(next));
      setStatus('saved');
    } catch (err: any) {
      const field = err?.response?.data?.field as Field | undefined;
      if (field && FIELDS.includes(field)) {
        setFieldError(field);
        setError(t(`contractSettings.fields.${field}.invalid`));
      } else {
        setError(t('contractSettings.saveFailed'));
      }
      setStatus('idle');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.headerTitle}>{t('contractSettings.title')}</h2>
        <p className={styles.headerSubtitle}>{t('contractSettings.subtitle')}</p>
      </div>
      <Card padding="md">
        {!draft ? (
          error ? (
            <p className={styles.error} role="alert">{error}</p>
          ) : (
            <p className={styles.status}>{t('contractSettings.loading')}</p>
          )
        ) : (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            {FIELDS.map((field) => (
              <div className={styles.field} key={field}>
                <label className={styles.label} htmlFor={`contract-setting-${field}`}>
                  {t(`contractSettings.fields.${field}.label`)}
                </label>
                <input
                  id={`contract-setting-${field}`}
                  className={styles.input}
                  value={draft[field]}
                  inputMode={field === 'numberPrefix' ? 'text' : field === 'reminderLeadDays' ? 'text' : 'numeric'}
                  maxLength={field === 'numberPrefix' ? 6 : 40}
                  aria-invalid={fieldError === field}
                  aria-describedby={`contract-setting-${field}-hint`}
                  disabled={status === 'saving'}
                  onChange={(event) => edit(field, field === 'numberPrefix' ? event.target.value.toUpperCase() : event.target.value)}
                />
                <p id={`contract-setting-${field}-hint`} className={styles.hint}>
                  {t(`contractSettings.fields.${field}.hint`)}
                </p>
              </div>
            ))}
            <div className={styles.actions}>
              <Button type="submit" isLoading={status === 'saving'} disabled={!dirty}>
                {t('contractSettings.save')}
              </Button>
              {error && <p className={styles.error} role="alert">{error}</p>}
              {status === 'saved' && <p className={styles.status} role="status">{t('contractSettings.saved')}</p>}
            </div>
          </form>
        )}
      </Card>
    </div>
  );
};
