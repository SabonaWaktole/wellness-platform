import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { useActiveLookups } from '../../hooks/useActiveLookups';
import { lookupLabel } from '../../utils/lookupLabel';
import type { DashboardPoint } from '../../types/roleDashboard';
import { ChartWithTable } from './ChartWithTable';
import { EmptyState } from './EmptyState';
import { KpiTile } from './KpiTile';
import { PeriodSelector } from './PeriodSelector';
import { RefreshBar } from './RefreshBar';
import type { RoleDashboardState } from './useRoleDashboard';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import styles from './RoleDashboard.module.css';

interface RoleDashboardFrameProps {
  title: string;
  subtitle: string;
  state: RoleDashboardState;
  /** The salesperson filter of the Sales Manager, between the period and the location. */
  extraFilters?: React.ReactNode;
  /** The period selector. The Administrator's dashboard describes the workspace now and has none (FR-DSH-03). */
  showPeriod?: boolean;
  /** The Area and City filters. Only the sales dashboards offer them (FR-DSH-04). */
  showLocation?: boolean;
  children?: React.ReactNode;
}

/**
 * What the four dashboards share (FR-DSH-03 to 07): the period selector, the predefined Area and City
 * filters, the "Calculated at" line with its refresh button, the figures as tiles that say whether they
 * follow the period, the pipeline chart with its table, and the empty state.
 */
export const RoleDashboardFrame: React.FC<RoleDashboardFrameProps> = ({ title, subtitle, state, extraFilters, showPeriod = true, showLocation = true, children }) => {
  const { t, i18n } = useTranslation('dashboard');
  const { tenantSlug = '' } = useParams();
  const stageLabel = useStatusLabel().deal;
  const areas = useActiveLookups('areas');
  const cities = useActiveLookups('cities', state.areaId ? { areaId: state.areaId } : undefined);
  const { data, loading, failed } = state;

  const stageOf = (point: DashboardPoint) => stageLabel(point.key);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        <RefreshBar calculatedAt={data?.calculatedAt} loading={loading} onRefresh={() => void state.refresh()} />
      </div>

      <div className={styles.filters}>
        {showPeriod && (
          <PeriodSelector
            preset={state.preset}
            from={state.from}
            to={state.to}
            onPreset={state.setPreset}
            onFrom={state.setFrom}
            onTo={state.setTo}
          />
        )}
        {extraFilters}
        {showLocation && (
          <>
            <SelectInput label={t('role.area')} value={state.areaId} onChange={(event) => state.setAreaId(event.target.value)}>
              <option value="">{t('role.allAreas')}</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {lookupLabel(area, i18n.language)}
                </option>
              ))}
            </SelectInput>
            <SelectInput label={t('role.city')} value={state.cityId} onChange={(event) => state.setCityId(event.target.value)}>
              <option value="">{t('role.allCities')}</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {lookupLabel(city, i18n.language)}
                </option>
              ))}
            </SelectInput>
          </>
        )}
      </div>

      {failed && (
        <div className={styles.error} role="alert">
          {t('role.loadFailed')}
        </div>
      )}

      {data && !failed && (data.empty ? (
        <EmptyState />
      ) : (
        <>
          <ul className={styles.tiles} aria-busy={loading}>
            {data.figures.map((figure) => (
              <KpiTile key={figure.key} figure={figure} tenantSlug={tenantSlug} preset={data.period.preset} />
            ))}
          </ul>
          {data.charts.pipeline && (
            <ChartWithTable title={t('role.pipelineChart')} points={data.charts.pipeline} labelOf={stageOf} />
          )}
          {children}
        </>
      ))}
    </div>
  );
};
