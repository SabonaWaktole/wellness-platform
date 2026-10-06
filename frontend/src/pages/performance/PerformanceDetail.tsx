import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '../../components/ui/Button/Button';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { useDateFormat } from '../../hooks/useDateFormat';
import { performanceService } from '../../services/performanceService';
import type { FigureKey, PerformanceFilters, PerformanceSeries, SeriesPoint } from '../../types/performance';
import { dayAsDate } from '../../components/calendar/calendarGrouping';
import { PERFORMANCE_COLUMNS, indicatorKey } from './performanceColumns';
import { usePerformanceFormat } from './usePerformanceFormat';
import styles from './PerformanceContent.module.css';

interface Props {
  salesperson: { id: string; name: string };
  filters: PerformanceFilters;
  /** Whether money may be shown: the column and the series are absent without `commercial.view`. */
  showsValue: boolean;
  onClose: () => void;
}

/** Overdue follow-ups are as of now, not by period, so a bucket has none. */
const SERIES_COLUMNS = PERFORMANCE_COLUMNS.filter((column) => column.key !== 'followUpsOverdue');

/**
 * One salesperson's indicators per week or per month (FR-PRF-08), as a chart and as the table behind it.
 * Both draw the same points the server sent, so they cannot disagree; the chart shows one indicator at a
 * time, because the indicators have different units.
 */
export const PerformanceDetail: React.FC<Props> = ({ salesperson, filters, showsValue, onClose }) => {
  const { t } = useTranslation('performance');
  const dates = useDateFormat();
  const { tenantSlug } = useParams();
  const { figure } = usePerformanceFormat();
  const [grain, setGrain] = useState<'WEEK' | 'MONTH'>('MONTH');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [indicator, setIndicator] = useState<FigureKey>('calls');
  const [series, setSeries] = useState<PerformanceSeries | null>(null);
  const [failed, setFailed] = useState(false);

  const columns = SERIES_COLUMNS.filter((column) => showsValue || column.key !== 'totalValue');
  const filterKey = JSON.stringify({ id: salesperson.id, preset: filters.preset, from: filters.from, to: filters.to, grain });

  useEffect(() => {
    if (!tenantSlug) return;
    let cancelled = false;
    setFailed(false);
    performanceService
      .fetchSeries(tenantSlug, salesperson.id, { preset: filters.preset, from: filters.from, to: filters.to }, grain)
      .then((data) => !cancelled && setSeries(data))
      .catch((error) => {
        console.error('Failed to load the series', error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // `filterKey` stands for the salesperson, the period and the grain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, tenantSlug]);

  const bucketLabel = (point: SeriesPoint) =>
    grain === 'MONTH' ? dates.custom(dayAsDate(point.from), { month: 'short', year: 'numeric' }) : dates.date(dayAsDate(point.from));
  const column = columns.find((candidate) => candidate.key === indicator) ?? columns[0];
  const days = t('daysUnit');
  const points = series?.points ?? [];
  const chartData = points.map((point) => ({ label: bucketLabel(point), value: (point.figures as Record<string, number | string | null | undefined>)[column.key] ?? null }));

  return (
    <section className={styles.detail} aria-label={t('detailTitle', { name: salesperson.name })}>
      <div className={styles.detailHeader}>
        <h2 className={styles.detailTitle}>{t('detailTitle', { name: salesperson.name })}</h2>
        <Button variant="outline" onClick={onClose}>
          {t('closeDetail')}
        </Button>
      </div>
      <div className={styles.detailControls}>
        <SelectInput label={t('grain')} value={grain} onChange={(event) => setGrain(event.target.value as 'WEEK' | 'MONTH')}>
          <option value="MONTH">{t('grainMonth')}</option>
          <option value="WEEK">{t('grainWeek')}</option>
        </SelectInput>
        {view === 'chart' && (
          <SelectInput label={t('chartIndicator')} value={column.key} onChange={(event) => setIndicator(event.target.value as FigureKey)}>
            {columns.map((candidate) => (
              <option key={candidate.key} value={candidate.key}>
                {t(`indicators.${indicatorKey(candidate.indicator)}`)}
              </option>
            ))}
          </SelectInput>
        )}
        <div className={styles.viewToggle} role="group" aria-label={t('viewLabel')}>
          <button type="button" aria-pressed={view === 'chart'} className={styles.toggle} onClick={() => setView('chart')}>
            {t('viewChart')}
          </button>
          <button type="button" aria-pressed={view === 'table'} className={styles.toggle} onClick={() => setView('table')}>
            {t('viewTable')}
          </button>
        </div>
      </div>

      {failed ? (
        <p role="alert">{t('failed')}</p>
      ) : view === 'chart' ? (
        <div className={styles.chart} role="img" aria-label={t('chartLabel', { indicator: t(`indicators.${indicatorKey(column.indicator)}`) })}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--chart-axis)" tickLine={false} fontSize={12} />
              <YAxis stroke="var(--chart-axis)" tickLine={false} fontSize={12} width={48} />
              <Tooltip formatter={(value) => figure(value as number | string | null, column.format, days)} />
              <Line type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2} dot connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('bucket')}</th>
                {columns.map((candidate) => (
                  <th key={candidate.key} className={styles.numeric}>
                    {t(`indicators.${indicatorKey(candidate.indicator)}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.from}>
                  <td>{bucketLabel(point)}</td>
                  {columns.map((candidate) => (
                    <td key={candidate.key} className={styles.numeric}>
                      {figure((point.figures as Record<string, number | string | null | undefined>)[candidate.key], candidate.format, days)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
