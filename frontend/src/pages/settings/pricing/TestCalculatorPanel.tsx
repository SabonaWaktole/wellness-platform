import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button';
import { PriceBreakdown } from '../../../components/pricing/PriceBreakdown';
import editorStyles from '../../../components/settings/LookupListEditor/LookupListEditor.module.css';
import type { TestCalculationResult } from '../../../services/pricingService';
import { lookupLabel } from '../../../utils/lookupLabel';
import type { PricingPanelProps } from './pricingTabs';
import { pricingErrorMessage } from './pricingErrorMessage';
import styles from './PricingSettings.module.css';

const BREAKDOWN = ['baseFee', 'riskFee', 'visitFee', 'locationFee'] as const;

/**
 * The test calculator (FR-PCF-09): the server's calculator on the current
 * configuration. It creates no offer and stores nothing. The screen only
 * formats the amounts the server returns; it never calculates a price.
 */
export const TestCalculatorPanel = ({ config, pricing }: PricingPanelProps) => {
  const { t, i18n } = useTranslation('settings');
  const [employees, setEmployees] = useState('');
  const [riskLevelId, setRiskLevelId] = useState('');
  const [frequencyId, setFrequencyId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<TestCalculationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = employees.trim() !== '' && riskLevelId && frequencyId && zoneId;

  const calculate = async () => {
    setCalculating(true);
    setError(null);
    setResult(null);
    try {
      setResult(await pricing.testCalculation({ employees: Number(employees), riskLevelId, frequencyId, zoneId }));
    } catch (err) {
      setError(pricingErrorMessage(err, t));
    } finally {
      setCalculating(false);
    }
  };

  const select = (label: string, value: string, onChange: (value: string) => void, options: Array<{ id: string; label: string }>) => (
    <label className={styles.field}>
      <span>{label}</span>
      <select className={editorStyles.select} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('pricing.calculator.choose')}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className={styles.stack}>
      <form
        className={styles.formGrid}
        onSubmit={(e) => {
          e.preventDefault();
          void calculate();
        }}
      >
        <label className={styles.field}>
          <span>{t('pricing.calculator.employees')}</span>
          <input
            className={editorStyles.input}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={employees}
            onChange={(e) => setEmployees(e.target.value)}
          />
        </label>
        {select(
          t('pricing.calculator.riskLevel'),
          riskLevelId,
          setRiskLevelId,
          config.riskSurcharges.filter((row) => row.active).map((row) => ({ id: row.riskLevelId, label: lookupLabel(row, i18n.language) }))
        )}
        {select(
          t('pricing.calculator.frequency'),
          frequencyId,
          setFrequencyId,
          config.frequencies.filter((f) => f.active).map((f) => ({ id: f.id, label: lookupLabel(f, i18n.language) }))
        )}
        {select(
          t('pricing.calculator.zone'),
          zoneId,
          setZoneId,
          config.zones.filter((z) => z.active).map((z) => ({ id: z.id, label: lookupLabel(z, i18n.language) }))
        )}
        <div>
          <Button type="submit" isLoading={calculating} disabled={!ready}>
            {t('pricing.calculator.calculate')}
          </Button>
        </div>
      </form>

      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}

      {result && (
        <section aria-label={t('pricing.calculator.result')} aria-live="polite">
          {result.kind === 'PRICED' ? (
            <PriceBreakdown
              rows={[
                ...BREAKDOWN.map((key) => ({ key, label: t(`pricing.calculator.${key}`), amount: result[key] })),
                { key: 'listPrice', label: t('pricing.calculator.listPrice'), amount: result.listPrice, total: true },
                { key: 'pricePerEmployee', label: t('pricing.calculator.pricePerEmployee'), amount: result.pricePerEmployee },
                { key: 'annualValue', label: t('pricing.calculator.annualValue'), amount: result.annualValue },
              ]}
            />
          ) : (
            <div className={styles.warning}>
              <p className={styles.warningTitle}>{t('pricing.calculator.priceOnRequest')}</p>
              <p>{t(`pricing.calculator.reasons.${result.reason}`)}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
