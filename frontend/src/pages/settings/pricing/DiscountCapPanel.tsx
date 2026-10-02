import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button';
import editorStyles from '../../../components/settings/LookupListEditor/LookupListEditor.module.css';
import type { PricingPanelProps } from './pricingTabs';
import { pricingErrorMessage } from './pricingErrorMessage';
import styles from './PricingSettings.module.css';

/**
 * The discount cap (FR-PCF-07): the highest discount % a salesperson may give
 * without approval. A change applies to new discounts at once.
 */
export const DiscountCapPanel = ({ config, pricing }: PricingPanelProps) => {
  const { t } = useTranslation('settings');
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const value = draft ?? config.discountCapPercent;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await pricing.setDiscountCap(value.trim());
      setDraft(null);
      setMessage({ text: t('pricing.saved'), failed: false });
    } catch (err) {
      setMessage({ text: pricingErrorMessage(err, t), failed: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className={styles.inlineForm}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className={styles.field}>
        <span>{t('pricing.cap.label')}</span>
        <input className={editorStyles.input} inputMode="decimal" value={value} onChange={(e) => setDraft(e.target.value)} />
      </label>
      <Button type="submit" size="sm" isLoading={saving} disabled={draft === null || draft === config.discountCapPercent}>
        {t('pricing.save')}
      </Button>
      {message && (
        <p className={message.failed ? styles.errorText : styles.successText} role={message.failed ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </form>
  );
};
