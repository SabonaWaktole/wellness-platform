import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button';
import { membershipSettingsService, refusedField, type Tier, type TierSetting } from '../../../services/membershipSettingsService';
import styles from './WellnessPlusSettings.module.css';

type Field = 'labelSq' | 'labelEn' | 'colour' | 'fee' | 'termMonths';

const toDraft = (tier: TierSetting): Record<Field, string> => ({
  labelSq: tier.labelSq,
  labelEn: tier.labelEn,
  colour: tier.colour,
  fee: tier.fee ?? '',
  termMonths: tier.termMonths === null ? '' : String(tier.termMonths),
});

/** One tier: label in both languages, colour, and, where the tier has them, fee and term (FR-TIR-01). */
const TierCard = ({ tenantSlug, tier, onSaved }: { tenantSlug: string; tier: TierSetting; onSaved: (tier: TierSetting) => void }) => {
  const { t, i18n } = useTranslation('settings');
  const [draft, setDraft] = useState(toDraft(tier));
  const [fieldError, setFieldError] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const hasFee = tier.tier === 'SILVER' || tier.tier === 'GOLD';
  const hasTerm = tier.tier !== 'BRONZE';
  const fields: Field[] = ['labelSq', 'labelEn', 'colour', ...(hasFee ? (['fee'] as Field[]) : []), ...(hasTerm ? (['termMonths'] as Field[]) : [])];
  const dirty = JSON.stringify(toDraft(tier)) !== JSON.stringify(draft);

  const edit = (field: Field, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setStatus('idle');
    setFieldError(null);
    setError(null);
  };

  const save = async () => {
    setStatus('saving');
    setError(null);
    setFieldError(null);
    try {
      const next = await membershipSettingsService.updateTier(tenantSlug, tier.tier, {
        labelSq: draft.labelSq,
        labelEn: draft.labelEn,
        colour: draft.colour,
        ...(hasFee ? { fee: draft.fee.trim() } : {}),
        ...(hasTerm ? { termMonths: Number(draft.termMonths) } : {}),
      });
      onSaved(next);
      setDraft(toDraft(next));
      setStatus('saved');
    } catch (err) {
      const field = refusedField(err) as Field | null;
      if (field && fields.includes(field)) {
        setFieldError(field);
        setError(t(`wellnessPlus.tiers.fields.${field}.invalid`));
      } else {
        setError(t('wellnessPlus.saveFailed'));
      }
      setStatus('idle');
    }
  };

  const name = i18n.language.startsWith('sq') ? tier.labelSq : tier.labelEn;
  return (
    <section className={styles.tierCard} aria-label={name}>
      <h3 className={styles.tierTitle}>
        <span className={styles.swatch} style={{ background: tier.colour }} aria-hidden="true" />
        {name}
      </h3>
      <p className={styles.hint}>{t(`wellnessPlus.tiers.hint.${tier.tier}`)}</p>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {fields.map((field) => (
          <div className={styles.field} key={field}>
            <label className={styles.label} htmlFor={`wp-tier-${tier.tier}-${field}`}>
              {t(`wellnessPlus.tiers.fields.${field}.label`)}
            </label>
            <input
              id={`wp-tier-${tier.tier}-${field}`}
              className={`${styles.input} ${field === 'colour' ? styles.colourInput : ''}`}
              type={field === 'colour' ? 'color' : 'text'}
              inputMode={field === 'fee' || field === 'termMonths' ? 'decimal' : 'text'}
              value={draft[field]}
              aria-invalid={fieldError === field}
              disabled={status === 'saving'}
              onChange={(event) => edit(field, event.target.value)}
            />
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
    </section>
  );
};

export const TiersPanel = ({ tenantSlug, tiers, onSaved }: { tenantSlug: string; tiers: TierSetting[]; onSaved: (tier: TierSetting) => void }) => (
  <div className={styles.tierList}>
    {tiers.map((tier) => (
      <TierCard key={tier.tier} tenantSlug={tenantSlug} tier={tier} onSaved={onSaved} />
    ))}
  </div>
);

export type { Tier };
