import React from 'react';
import { useTranslation } from 'react-i18next';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { DASHBOARD_PRESETS } from '../../types/roleDashboard';
import type { DashboardPreset } from '../../types/roleDashboard';

interface PeriodSelectorProps {
  preset: DashboardPreset;
  from: string;
  to: string;
  onPreset: (preset: DashboardPreset) => void;
  onFrom: (day: string) => void;
  onTo: (day: string) => void;
}

/** Today, This week, This month (the default), This quarter, This year or a custom range (FR-DSH-03). */
export const PeriodSelector: React.FC<PeriodSelectorProps> = ({ preset, from, to, onPreset, onFrom, onTo }) => {
  const { t } = useTranslation('dashboard');
  return (
    <>
      <SelectInput label={t('role.period')} value={preset} onChange={(event) => onPreset(event.target.value as DashboardPreset)}>
        {DASHBOARD_PRESETS.map((key) => (
          <option key={key} value={key}>
            {t(`role.presets.${key}`)}
          </option>
        ))}
      </SelectInput>
      {preset === 'CUSTOM' && (
        <>
          <TextInput label={t('role.from')} type="date" value={from} onChange={(event) => onFrom(event.target.value)} />
          <TextInput label={t('role.to')} type="date" value={to} onChange={(event) => onTo(event.target.value)} />
        </>
      )}
    </>
  );
};
