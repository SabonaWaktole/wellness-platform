import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button';
import { membershipSettingsService, refusedField, type MembershipRules } from '../../../services/membershipSettingsService';
import styles from './WellnessPlusSettings.module.css';

type Field = keyof MembershipRules;
const FIELDS: Field[] = ['familyDiscountPercent', 'graceDays', 'expiringSoonDays', 'vipReviewNoticeDays', 'memberPrefix', 'receiptPrefix'];
const PREFIXES: Field[] = ['memberPrefix', 'receiptPrefix'];

const toDraft = (rules: MembershipRules): Record<Field, string> =>
  Object.fromEntries(FIELDS.map((f) => [f, String(rules[f])])) as Record<Field, string>;

/** FR-TIR-05, FR-TIR-10, FR-FAM-04, FR-MEM-03, FR-MPAY-05, FR-VIP-04. The server is the only judge of the values. */
export const RulesPanel = ({ tenantSlug, rules, onSaved }: { tenantSlug: string; rules: MembershipRules; onSaved: (rules: MembershipRules) => void }) => {
  const { t } = useTranslation('settings');
  const [draft, setDraft] = useState(toDraft(rules));
  const [fieldError, setFieldError] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const dirty = JSON.stringify(toDraft(rules)) !== JSON.stringify(draft);

  const edit = (field: Field, value: string) => {
    setDraft((d) => ({ ...d, [field]: PREFIXES.includes(field) ? value.toUpperCase() : value }));
    setStatus('idle');
    setFieldError(null);
    setError(null);
  };

  const save = async () => {
    setStatus('saving');
    setError(null);
    setFieldError(null);
    try {
      const next = await membershipSettingsService.updateRules(tenantSlug, {
        familyDiscountPercent: draft.familyDiscountPercent.trim(),
        graceDays: Number(draft.graceDays),
        expiringSoonDays: Number(draft.expiringSoonDays),
        vipReviewNoticeDays: Number(draft.vipReviewNoticeDays),
        memberPrefix: draft.memberPrefix.trim(),
        receiptPrefix: draft.receiptPrefix.trim(),
      });
      onSaved(next);
      setDraft(toDraft(next));
      setStatus('saved');
    } catch (err) {
      const field = refusedField(err) as Field | null;
      if (field && FIELDS.includes(field)) {
        setFieldError(field);
        setError(t(`wellnessPlus.rules.${field}.invalid`));
      } else {
        setError(t('wellnessPlus.saveFailed'));
      }
      setStatus('idle');
    }
  };

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {FIELDS.map((field) => (
        <div className={styles.field} key={field}>
          <label className={styles.label} htmlFor={`wp-rule-${field}`}>
            {t(`wellnessPlus.rules.${field}.label`)}
          </label>
          <input
            id={`wp-rule-${field}`}
            className={styles.input}
            value={draft[field]}
            inputMode={PREFIXES.includes(field) ? 'text' : 'decimal'}
            maxLength={PREFIXES.includes(field) ? 6 : 8}
            aria-invalid={fieldError === field}
            aria-describedby={`wp-rule-${field}-hint`}
            disabled={status === 'saving'}
            onChange={(event) => edit(field, event.target.value)}
          />
          <p id={`wp-rule-${field}-hint`} className={styles.hint}>
            {t(`wellnessPlus.rules.${field}.hint`)}
          </p>
        </div>
      ))}
      <div className={styles.actions}>
        <Button type="submit" isLoading={status === 'saving'} disabled={!dirty}>
          {t('wellnessPlus.save')}
        </Button>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {status === 'saved' && (
          <p className={styles.status} role="status">
            {t('wellnessPlus.saved')}
          </p>
        )}
      </div>
    </form>
  );
};
