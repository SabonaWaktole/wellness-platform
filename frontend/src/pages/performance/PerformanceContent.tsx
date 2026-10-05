import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Download, Minus, TrendingUp } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { dayAsDate } from '../../components/calendar/calendarGrouping';
import { useDateFormat } from '../../hooks/useDateFormat';
import { usePermission } from '../../hooks/usePermission';
import { performanceService } from '../../services/performanceService';
import { downloadBlob } from '../../utils/downloadBlob';
import { PERIOD_PRESETS } from '../../types/performance';
import type { FigureChange, PerformanceFilters, PerformanceResult, PerformanceRow, PeriodPreset } from '../../types/performance';
import { PERFORMANCE_COLUMNS, indicatorKey } from './performanceColumns';
import type { PerformanceColumn } from './performanceColumns';
import { PerformanceDetail } from './PerformanceDetail';
import { PerformanceRecordsDialog, type RecordsTarget } from './PerformanceRecordsDialog';
import { usePerformanceFormat } from './usePerformanceFormat';
import styles from './PerformanceContent.module.css';

const ARROW = { UP: ArrowUp, DOWN: ArrowDown, SAME: Minus } as const;

/**
 * The Performance screen (FR-PRF-01 to 10): one row per salesperson and a total row of the fourteen
 * indicators, for a period and a set of salespeople. It shows what the server sends and works nothing
 * out: the rows a viewer may see, the total (calculated from the data, not by averaging the rows), the
 * rates, the change against the previous period and the absence of money without `commercial.view` are all
 * the server's. A Sales User gets their own row only and no total.
 */
export const PerformanceContent: React.FC = () => {
  const { t, i18n } = useTranslation('performance');
  const { t: tc } = useTranslation('common');
  const dates = useDateFormat();
  const { tenantSlug } = useParams();
  const { figure, change } = usePerformanceFormat();
  const showsValue = usePermission('commercial.view');

  const [preset, setPreset] = useState<PeriodPreset>('THIS_MONTH');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [compare, setCompare] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const [result, setResult] = useState<PerformanceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const [records, setRecords] = useState<RecordsTarget | null>(null);
  const [detailFor, setDetailFor] = useState<{ id: string; name: string } | null>(null);

  const customReady = preset !== 'CUSTOM' || (from !== '' && to !== '' && from <= to);
  const filters: PerformanceFilters = {
    preset,
    ...(preset === 'CUSTOM' ? { from, to } : {}),
    ...(picked.length > 0 ? { salespersonIds: picked } : {}),
    compare,
  };
  const filterKey = JSON.stringify(filters);

  const load = useCallback(async () => {
    if (!tenantSlug || !customReady) return;
    setLoading(true);
    setFailed(false);
    try {
      setResult(await performanceService.fetch(tenantSlug, JSON.parse(filterKey)));
    } catch (error) {
      console.error('Failed to load performance', error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, filterKey, customReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportAs = async (format: 'csv' | 'pdf') => {
    if (!tenantSlug) return;
    setExporting(format);
    try {
      const blob = await performanceService.download(tenantSlug, filters, format, i18n.language.startsWith('en') ? 'en' : 'sq');
      downloadBlob(blob, `performance-${new Date().toISOString().slice(0, 10)}.${format}`);
    } catch (error) {
      console.error('Failed to export performance', error);
      setFailed(true);
    } finally {
      setExporting(null);
    }
  };

  const togglePicked = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  const days = t('daysUnit');
  const columns = PERFORMANCE_COLUMNS.filter((column) => showsValue || column.key !== 'totalValue');
  const rows = result?.rows ?? [];
  const day = (key: string) => dates.date(dayAsDate(key));

  const open = (indicator: PerformanceColumn['indicator'], row?: PerformanceRow) =>
    setRecords({ indicator, salespersonId: row?.salesperson.id, salespersonName: row?.salesperson.name });

  /** A figure as a button that lists the records behind it (FR-PRF-07), with its change when comparing (FR-PRF-06). */
  const cell = (column: PerformanceColumn, figures: PerformanceRow['figures'], moved: FigureChange | null | undefined, row?: PerformanceRow) => {
    const value = figures[column.key];
    const Arrow = moved ? ARROW[moved.direction] : null;
    return (
      <td key={column.indicator} className={styles.numeric}>
        <button
          type="button"
          className={styles.figure}
          aria-label={t('openRecords', {
            indicator: t(`indicators.${indicatorKey(column.indicator)}`),
            name: row?.salesperson.name ?? t('totalRow'),
            value: figure(value, column.format, days),
          })}
          onClick={() => open(column.indicator, row)}
        >
          {figure(value, column.format, days)}
        </button>
        {column.indicator === 'FOLLOW_UPS_COMPLETED' && figures.onTimeShare !== null && (
          <span className={styles.sub}>{t('onTime', { share: figures.onTimeShare })}</span>
        )}
        {moved && Arrow && (
          <span className={styles.change} data-direction={moved.direction}>
            <Arrow size={12} aria-hidden="true" />
            <span className="sr-only">{t(`direction.${moved.direction}`)}</span>
            {change(moved, column.format, days)}
          </span>
        )}
      </td>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('breadcrumb')}</div>
          <h1 className={styles.title}>{t('title')}</h1>
        </div>
        <div className={styles.actions}>
          <Button variant="outline" icon={<Download size={16} />} onClick={() => exportAs('csv')} disabled={exporting !== null || rows.length === 0}>
            {t('exportCsv')}
          </Button>
          <Button variant="outline" icon={<Download size={16} />} onClick={() => exportAs('pdf')} disabled={exporting !== null || rows.length === 0}>
            {t('exportPdf')}
          </Button>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.filters}>
          <SelectInput label={t('filterPeriod')} value={preset} onChange={(event) => setPreset(event.target.value as PeriodPreset)}>
            {PERIOD_PRESETS.map((key) => (
              <option key={key} value={key}>
                {t(`presets.${key}`)}
              </option>
            ))}
          </SelectInput>
          {preset === 'CUSTOM' && (
            <>
              <TextInput label={t('filterFrom')} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              <TextInput label={t('filterTo')} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </>
          )}
          <label className={styles.filterCheck}>
            <input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} />
            {t('compare')}
          </label>
        </div>

        {result && !result.ownOnly && result.salespeople.length > 1 && (
          <fieldset className={styles.people}>
            <legend className={styles.peopleLegend}>{t('filterSalespeople')}</legend>
            {result.salespeople.map((person) => (
              <button
                key={person.id}
                type="button"
                className={styles.chip}
                aria-pressed={picked.includes(person.id)}
                onClick={() => togglePicked(person.id)}
              >
                {person.name}
              </button>
            ))}
            {picked.length > 0 && (
              <button type="button" className={styles.clear} onClick={() => setPicked([])}>
                {t('allSalespeople')}
              </button>
            )}
          </fieldset>
        )}

        {result && (
          <p className={styles.period}>
            {t('periodLine', { from: day(result.period.from), to: day(result.period.to) })}
            {result.period.previous && ` · ${t('comparedWith', { from: day(result.period.previous.from), to: day(result.period.previous.to) })}`}
          </p>
        )}

        <div className={styles.tableContainer}>
          {!customReady ? (
            <div className={styles.emptyState}>
              <h3 className={styles.emptyTitle}>{t('chooseDays')}</h3>
            </div>
          ) : failed ? (
            <div className={styles.emptyState} role="alert">
              <h3 className={styles.emptyTitle}>{t('failed')}</h3>
            </div>
          ) : !loading && rows.length === 0 ? (
            <div className={styles.emptyState}>
              <TrendingUp size={48} className={styles.emptyIcon} />
              <h3 className={styles.emptyTitle}>{t('empty')}</h3>
              <p className={styles.emptyMessage}>{t('emptyMessage')}</p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.stickyCol}>{t('columnSalesperson')}</th>
                  {columns.map((column) => (
                    <th key={column.indicator} className={styles.numeric}>
                      {t(`indicators.${indicatorKey(column.indicator)}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={columns.length + 1} className={styles.loadingCell}>
                      {tc('state.loading')}
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((row) => (
                    <tr key={row.salesperson.id}>
                      <th scope="row" className={styles.stickyCol}>
                        <button type="button" className={styles.person} onClick={() => setDetailFor({ id: row.salesperson.id, name: row.salesperson.name })}>
                          {row.salesperson.name}
                        </button>
                        {!row.salesperson.isActive && <span className={styles.sub}>{t('deactivated')}</span>}
                      </th>
                      {columns.map((column) => cell(column, row.figures, row.change?.[column.key], row))}
                    </tr>
                  ))}
                {!loading && result?.total && (
                  <tr className={styles.totalRow}>
                    <th scope="row" className={styles.stickyCol}>
                      {t('totalRow')}
                    </th>
                    {columns.map((column) => cell(column, result.total!.figures, result.total!.change?.[column.key]))}
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {detailFor && <PerformanceDetail salesperson={detailFor} filters={filters} showsValue={showsValue} onClose={() => setDetailFor(null)} />}
      <PerformanceRecordsDialog target={records} filters={filters} onClose={() => setRecords(null)} />
    </div>
  );
};
