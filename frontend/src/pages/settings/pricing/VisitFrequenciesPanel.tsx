import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/ui/Badge';
import { LookupListEditor, type LookupColumn } from '../../../components/settings/LookupListEditor/LookupListEditor';
import editorStyles from '../../../components/settings/LookupListEditor/LookupListEditor.module.css';
import { useMoneyFormat } from '../../../hooks/useMoneyFormat';
import type { VisitFrequency } from '../../../services/pricingService';
import type { PricingPanelProps } from './pricingTabs';
import { pricingErrorMessage } from './pricingErrorMessage';

/**
 * Visit frequencies (FR-PCF-04): a label, optional visits per year (for
 * reports), and a percentage of the base fee or a fixed monthly amount. A new
 * frequency is offered at once.
 */
export const VisitFrequenciesPanel = ({ config, pricing }: PricingPanelProps) => {
  const { t } = useTranslation('settings');
  const { format } = useMoneyFormat();

  const valueText = (frequency: VisitFrequency) =>
    frequency.pricingType === 'FIXED' ? format(Number(frequency.frequencyValue)) : t('pricing.percent', { value: frequency.frequencyValue });

  const columns: LookupColumn<VisitFrequency>[] = [
    {
      field: 'pricingType',
      header: t('pricing.columns.pricingType'),
      render: (item) => <Badge variant="secondary">{t(`pricing.pricingTypes.${item.pricingType}`)}</Badge>,
      renderInput: ({ id, label, value, onChange }) => (
        <select id={id} className={editorStyles.select} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="PERCENT">{t('pricing.pricingTypes.PERCENT')}</option>
          <option value="FIXED">{t('pricing.pricingTypes.FIXED')}</option>
        </select>
      ),
      draftOf: (item) => item?.pricingType ?? 'PERCENT',
    },
    {
      field: 'frequencyValue',
      header: t('pricing.columns.value'),
      render: valueText,
      renderInput: ({ id, label, value, onChange }) => (
        <input id={id} className={editorStyles.input} aria-label={label} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      ),
      draftOf: (item) => item?.frequencyValue ?? '',
    },
    {
      field: 'visitsPerYear',
      header: t('pricing.columns.visitsPerYear'),
      render: (item) => item.visitsPerYear ?? <span className={editorStyles.muted}>—</span>,
      renderInput: ({ id, label, value, onChange }) => (
        <input
          id={id}
          className={editorStyles.input}
          aria-label={label}
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('lists.optional')}
        />
      ),
      draftOf: (item) => (item?.visitsPerYear == null ? '' : String(item.visitsPerYear)),
    },
  ];

  return (
    <LookupListEditor
      caption={t('pricing.tabs.frequencies')}
      items={config.frequencies}
      columns={columns}
      toValues={(draft) => ({
        pricingType: draft.pricingType,
        frequencyValue: draft.frequencyValue.trim(),
        visitsPerYear: draft.visitsPerYear.trim() ? Number(draft.visitsPerYear) : null,
      })}
      onCreate={(values) => pricing.create('frequencies', values)}
      onUpdate={(id, values) => pricing.update('frequencies', id, values)}
      onReorder={(ids) => pricing.reorder('frequencies', ids)}
      onSetActive={(id, active) => pricing.setActive('frequencies', id, active)}
      onDelete={(id) => pricing.remove('frequencies', id)}
      errorMessage={(err) => pricingErrorMessage(err, t)}
    />
  );
};
