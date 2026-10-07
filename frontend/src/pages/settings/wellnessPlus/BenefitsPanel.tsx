import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button';
import { membershipSettingsService, refusedField, TIERS, type BenefitService, type BenefitTable, type Tier } from '../../../services/membershipSettingsService';
import styles from './WellnessPlusSettings.module.css';

const show = (value: string | null) => (value === null ? '' : String(Number(value)));

/**
 * The benefit table, tiers as columns (FR-BEN-01, FR-BEN-04). The Administrator
 * edits it; anyone else who can open it sees text and no edit control. The page
 * shows the discount that applies and records nothing about use (FR-BEN-06).
 */
export const BenefitsPanel = ({ tenantSlug, canEdit }: { tenantSlug: string; canEdit: boolean }) => {
  const { t, i18n } = useTranslation('settings');
  const [table, setTable] = useState<BenefitTable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [badCell, setBadCell] = useState<string | null>(null);
  const [nameSq, setNameSq] = useState('');
  const [nameEn, setNameEn] = useState('');
  const albanian = i18n.language.startsWith('sq');

  const load = useCallback(() => {
    membershipSettingsService
      .getBenefits(tenantSlug)
      .then(setTable)
      .catch(() => setError(t('wellnessPlus.loadFailed')));
  }, [tenantSlug, t]);
  useEffect(load, [load]);

  const tierLabel = (tier: Tier) => {
    const row = table?.tiers.find((x) => x.tier === tier);
    return row ? (albanian ? row.labelSq : row.labelEn) : tier;
  };

  const saveCell = async (service: BenefitService, tier: Tier, text: string) => {
    const next = text.trim() === '' ? null : text.trim();
    if (next === service.discounts[tier] || (next !== null && service.discounts[tier] !== null && Number(next) === Number(service.discounts[tier]))) {
      setBadCell(null);
      return;
    }
    setError(null);
    setBadCell(null);
    try {
      await membershipSettingsService.updateBenefit(tenantSlug, service.id, { discounts: { [tier]: next } });
      load();
    } catch (err) {
      setBadCell(`${service.id}:${tier}`);
      setError(refusedField(err) ? t('wellnessPlus.benefits.invalid') : t('wellnessPlus.saveFailed'));
    }
  };

  const toggle = async (service: BenefitService) => {
    setError(null);
    try {
      await membershipSettingsService.updateBenefit(tenantSlug, service.id, { active: !service.active });
      load();
    } catch {
      setError(t('wellnessPlus.saveFailed'));
    }
  };

  const add = async () => {
    setError(null);
    try {
      await membershipSettingsService.createBenefit(tenantSlug, { nameSq, nameEn });
      setNameSq('');
      setNameEn('');
      load();
    } catch {
      setError(t('wellnessPlus.benefits.invalidName'));
    }
  };

  if (!table) return error ? <p className={styles.error} role="alert">{error}</p> : <p className={styles.status}>{t('wellnessPlus.loading')}</p>;

  return (
    <div className={styles.container}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t('wellnessPlus.benefits.service')}</th>
              {TIERS.map((tier) => (
                <th scope="col" key={tier} style={{ textAlign: 'right' }}>
                  {tierLabel(tier)}
                </th>
              ))}
              {canEdit && (
                <th scope="col">
                  <span className="sr-only">{t('wellnessPlus.relationships.action')}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {table.services.map((service) => (
              <tr key={service.id} className={service.active ? '' : styles.inactive}>
                <th scope="row" className={styles.serviceName}>
                  {albanian ? service.nameSq : service.nameEn}
                </th>
                {TIERS.map((tier) => (
                  <td key={tier}>
                    {canEdit ? (
                      <input
                        className={styles.percentInput}
                        inputMode="decimal"
                        defaultValue={show(service.discounts[tier])}
                        key={`${service.id}-${tier}-${service.discounts[tier]}`}
                        aria-label={`${albanian ? service.nameSq : service.nameEn} — ${tierLabel(tier)} (%)`}
                        aria-invalid={badCell === `${service.id}:${tier}`}
                        onBlur={(event) => void saveCell(service, tier, event.target.value)}
                      />
                    ) : (
                      <div className={styles.percentText}>{service.discounts[tier] === null ? '—' : `${show(service.discounts[tier])}%`}</div>
                    )}
                  </td>
                ))}
                {canEdit && (
                  <td>
                    <Button variant="outline" size="sm" onClick={() => void toggle(service)}>
                      {service.active ? t('wellnessPlus.deactivate') : t('wellnessPlus.activate')}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {canEdit && (
        <>
          <h3 className={styles.sectionTitle}>{t('wellnessPlus.benefits.addTitle')}</h3>
          <form
            className={styles.addRow}
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
          >
            <div className={styles.field}>
              <label className={styles.label} htmlFor="wp-ben-sq">{t('wellnessPlus.nameSq')}</label>
              <input id="wp-ben-sq" className={styles.input} value={nameSq} onChange={(e) => setNameSq(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="wp-ben-en">{t('wellnessPlus.nameEn')}</label>
              <input id="wp-ben-en" className={styles.input} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </div>
            <Button type="submit" disabled={!nameSq.trim() || !nameEn.trim()}>
              {t('wellnessPlus.benefits.add')}
            </Button>
          </form>
        </>
      )}
    </div>
  );
};
