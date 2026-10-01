import { useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button';
import { RichTextField } from '../../../components/ui/RichTextField';
import editorStyles from '../../../components/settings/LookupListEditor/LookupListEditor.module.css';
import { OFFER_TEXT_FIELDS, type OfferSettings, type OfferTextField } from '../../../services/pricingService';
import type { RichTextDoc } from '../../../types/form';
import type { PricingPanelProps } from './pricingTabs';
import { pricingErrorMessage } from './pricingErrorMessage';
import styles from './PricingSettings.module.css';

const NUMBER_FIELDS = ['offerValidityDays', 'contractMonthsDefault'] as const;
const DETAIL_FIELDS = ['companyName', 'nipt', 'phone', 'email', 'website', 'address', 'bankDetails'] as const;
const MULTILINE: ReadonlyArray<string> = ['address', 'bankDetails'];
const TEXTS = ['intro', 'terms', 'closing'] as const;
type Language = 'Sq' | 'En';

type TextField = (typeof NUMBER_FIELDS)[number] | 'offerNumberPrefix' | (typeof DETAIL_FIELDS)[number];

/** What a field's input shows for a stored value. */
const asText = (value: string | number | null) => (value === null ? '' : String(value));

/** A typed whole number as the API takes it; anything else is sent as typed, for the server to refuse by field. */
const asNumber = (text: string): number | string => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : text);

/**
 * Offer settings (FR-PCF-08): how long an offer is valid after it is marked
 * as sent, the contract length the annual value is calculated over, the
 * offer number prefix, Wellness Albania's details printed on the offer, and
 * the standard introduction, terms and closing in Albanian and English.
 * One save sends only what changed; the server sanitises the texts.
 */
export const OfferSettingsPanel = ({ config, pricing }: PricingPanelProps) => {
  const { t } = useTranslation('settings');
  const saved = config.offerSettings;
  const [fields, setFields] = useState<Partial<Record<TextField, string>>>({});
  const [texts, setTexts] = useState<Partial<Record<OfferTextField, RichTextDoc | null>>>({});
  const [language, setLanguage] = useState<Language>('Sq');
  // Re-mounts the text editors after a save, so they show what the server stored.
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; failed: boolean; field?: string } | null>(null);

  const valueOf = (field: TextField) => fields[field] ?? asText(saved[field]);
  const textOf = (field: OfferTextField) => (field in texts ? texts[field]! : saved[field]);
  const setField = (field: TextField) => (value: string) => setFields((current) => ({ ...current, [field]: value }));

  const changes = (): Partial<OfferSettings> => {
    const result: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(fields) as [TextField, string][]) {
      if (value === asText(saved[field])) continue;
      if ((NUMBER_FIELDS as readonly string[]).includes(field)) result[field] = asNumber(value);
      else if (field === 'offerNumberPrefix') result[field] = value.trim();
      else result[field] = value.trim() === '' ? null : value;
    }
    for (const field of OFFER_TEXT_FIELDS) {
      if (field in texts && JSON.stringify(texts[field]) !== JSON.stringify(saved[field])) result[field] = texts[field];
    }
    return result as Partial<OfferSettings>;
  };
  const dirty = Object.keys(changes()).length > 0;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await pricing.updateOfferSettings(changes());
      setFields({});
      setTexts({});
      setVersion((current) => current + 1);
      setMessage({ text: t('pricing.saved'), failed: false });
    } catch (err) {
      const field = (err as { response?: { data?: { field?: string } } })?.response?.data?.field;
      setMessage({ text: pricingErrorMessage(err, t), failed: true, field });
    } finally {
      setSaving(false);
    }
  };

  const errorFor = (field: string) => (message?.failed && message.field === field ? message.text : undefined);

  const input = (field: TextField, props: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className={styles.field}>
      <span>{t(`pricing.offer.fields.${field}`)}</span>
      {MULTILINE.includes(field) ? (
        <textarea
          className={editorStyles.input}
          rows={3}
          value={valueOf(field)}
          onChange={(e) => setField(field)(e.target.value)}
          aria-invalid={errorFor(field) ? true : undefined}
        />
      ) : (
        <input
          className={editorStyles.input}
          value={valueOf(field)}
          onChange={(e) => setField(field)(e.target.value)}
          aria-invalid={errorFor(field) ? true : undefined}
          {...props}
        />
      )}
      {errorFor(field) && (
        <span className={styles.errorText} role="alert">
          {errorFor(field)}
        </span>
      )}
    </label>
  );

  return (
    <form
      className={styles.stack}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <fieldset className={styles.section}>
        <legend className={styles.sectionTitle}>{t('pricing.offer.sections.offer')}</legend>
        <div className={styles.formGrid}>
          {input('offerValidityDays', { inputMode: 'numeric' })}
          {input('contractMonthsDefault', { inputMode: 'numeric' })}
          {input('offerNumberPrefix', {
            maxLength: 6,
            autoCapitalize: 'characters',
            onChange: (e) => setField('offerNumberPrefix')(e.target.value.toUpperCase()),
          })}
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.sectionTitle}>{t('pricing.offer.sections.company')}</legend>
        <p className={styles.mutedText}>{t('pricing.offer.companyHint')}</p>
        <div className={styles.formGrid}>
          {DETAIL_FIELDS.map((field) => (
            <span key={field} className={MULTILINE.includes(field) ? styles.fullWidth : undefined}>
              {input(field, field === 'email' ? { type: 'email' } : field === 'phone' ? { type: 'tel' } : {})}
            </span>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.sectionTitle}>{t('pricing.offer.sections.texts')}</legend>
        <p className={styles.mutedText}>{t('pricing.offer.textsHint')}</p>
        <div className={styles.languageSwitch} role="group" aria-label={t('pricing.offer.language')}>
          {(['Sq', 'En'] as const).map((lang) => (
            <button key={lang} type="button" aria-pressed={language === lang} onClick={() => setLanguage(lang)}>
              {t(`pricing.offer.languages.${lang}`)}
            </button>
          ))}
        </div>
        {TEXTS.map((text) => {
          const field = `${text}${language}` as OfferTextField;
          return (
            <RichTextField
              key={`${field}-${version}`}
              label={t(`pricing.offer.texts.${text}`, { language: t(`pricing.offer.languages.${language}`) })}
              value={textOf(field)}
              onChange={(value) => setTexts((current) => ({ ...current, [field]: value }))}
              error={errorFor(field)}
            />
          );
        })}
      </fieldset>

      <div className={styles.toolbar}>
        <Button type="submit" size="sm" isLoading={saving} disabled={!dirty}>
          {t('pricing.save')}
        </Button>
      </div>
      {message && !message.field && (
        <p className={message.failed ? styles.errorText : styles.successText} role={message.failed ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </form>
  );
};
