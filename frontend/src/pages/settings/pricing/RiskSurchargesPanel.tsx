import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import editorStyles from '../../../components/settings/LookupListEditor/LookupListEditor.module.css';
import type { RiskSurcharge } from '../../../services/pricingService';
import { lookupLabel } from '../../../utils/lookupLabel';
import type { PricingPanelProps } from './pricingTabs';
import { pricingErrorMessage } from './pricingErrorMessage';
import styles from './PricingSettings.module.css';

/**
 * Risk surcharges (FR-PCF-02): one % per M1 risk level, saved row by row.
 * Changing Medium from 10% to 12% changes new calculations only.
 */
export const RiskSurchargesPanel = ({ config, pricing }: PricingPanelProps) => {
  const { t, i18n } = useTranslation('settings');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ riskLevelId: string; text: string; failed: boolean } | null>(null);

  const draftOf = (row: RiskSurcharge) => drafts[row.riskLevelId] ?? row.riskSurchargePercent ?? '';

  const save = async (row: RiskSurcharge) => {
    setSaving(row.riskLevelId);
    setMessage(null);
    try {
      await pricing.setRiskSurcharge(row.riskLevelId, draftOf(row).trim());
      setDrafts(({ [row.riskLevelId]: _saved, ...rest }) => rest);
      setMessage({ riskLevelId: row.riskLevelId, text: t('pricing.saved'), failed: false });
    } catch (err) {
      setMessage({ riskLevelId: row.riskLevelId, text: pricingErrorMessage(err, t), failed: true });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className={editorStyles.editor}>
      <table className={editorStyles.table}>
        <caption className={editorStyles.srOnly}>{t('pricing.tabs.risk')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('pricing.columns.riskLevel')}</th>
            <th scope="col">{t('pricing.columns.surcharge')}</th>
            <th scope="col">
              <span className={editorStyles.srOnly}>{t('lists.columns.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {config.riskSurcharges.map((row) => {
            const name = lookupLabel(row, i18n.language);
            const inputId = `risk-surcharge-${row.riskLevelId}`;
            const changed = draftOf(row) !== (row.riskSurchargePercent ?? '');
            return (
              <tr key={row.riskLevelId} className={`${editorStyles.row} ${row.active ? '' : editorStyles.inactiveRow}`}>
                <td className={`${editorStyles.cell} ${editorStyles.nameCell}`} data-label={t('pricing.columns.riskLevel')}>
                  <label htmlFor={inputId}>{name}</label>{' '}
                  {!row.active && <Badge variant="outline">{t('lists.inactive')}</Badge>}
                  {row.riskSurchargePercent === null && (
                    <p className={styles.mutedText}>
                      {t('pricing.notSet')}. {t('pricing.notSetHint')}
                    </p>
                  )}
                </td>
                <td className={editorStyles.cell} data-label={t('pricing.columns.surcharge')}>
                  <input
                    id={inputId}
                    className={editorStyles.input}
                    inputMode="decimal"
                    value={draftOf(row)}
                    onChange={(e) => setDrafts((current) => ({ ...current, [row.riskLevelId]: e.target.value }))}
                  />
                  {message?.riskLevelId === row.riskLevelId && (
                    <p className={message.failed ? styles.errorText : styles.successText} role={message.failed ? 'alert' : 'status'}>
                      {message.text}
                    </p>
                  )}
                </td>
                <td className={`${editorStyles.cell} ${editorStyles.actionsCell}`}>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void save(row)}
                    isLoading={saving === row.riskLevelId}
                    disabled={!changed || saving !== null}
                    aria-label={`${t('pricing.save')}: ${name}`}
                  >
                    {t('pricing.save')}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
