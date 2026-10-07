import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { SelectInput } from '../../../components/ui/SelectInput/SelectInput';
import { useActiveLookups } from '../../../hooks/useActiveLookups';
import { useDateFormat } from '../../../hooks/useDateFormat';
import { useMoneyFormat } from '../../../hooks/useMoneyFormat';
import { dayAsDate } from '../../../components/calendar/calendarGrouping';
import { lookupLabel } from '../../../utils/lookupLabel';
import { downloadBlob } from '../../../utils/downloadBlob';
import { PeriodSelector } from '../../dashboard/PeriodSelector';
import dashboard from '../../dashboard/RoleDashboard.module.css';
import { TIERS } from '../../../services/membershipSettingsService';
import {
  membershipReportService,
  type EmployerRow,
  type MembershipReport,
  type ReportFilters,
  type ReportName,
  type ReportPreset,
  type WorkingListRow,
} from '../../../services/membershipReportService';
import { useTierLabels } from '../useTierLabels';
import members from '../Members.module.css';
import { buildSections, type ReportSection } from './reportSections';
import styles from './Reports.module.css';

const NO_FILTERS: ReportFilters = { tier: '', segment: '', employerClientId: '', areaId: '', cityId: '' };
const dash = '—';

const writers = (locale: string) => {
  const nf = new Intl.NumberFormat(locale);
  return { number: (v: number) => nf.format(v), percent: (v: string | null) => (v === null ? dash : `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v))}%`) };
};

const SectionPanel: React.FC<{ section: ReportSection; onExport: (name: ReportName) => void; exporting: boolean }> = ({ section, onExport, exporting }) => {
  const { t } = useTranslation('members');
  const [view, setView] = useState<'chart' | 'table'>(section.bars ? 'chart' : 'table');
  const widest = Math.max(1, ...(section.bars ?? []).map((b) => b.value));
  return (
    <section className={dashboard.panel} aria-label={section.title} data-report={section.name}>
      <div className={dashboard.panelHeader}>
        <h2 className={dashboard.panelTitle}>{section.title}</h2>
        <div className={styles.sectionActions}>
          {section.bars && (
            <div className={dashboard.toggle} role="group" aria-label={t('reports.view')}>
              {(['chart', 'table'] as const).map((choice) => (
                <button key={choice} type="button" className={dashboard.toggleButton} aria-pressed={view === choice} onClick={() => setView(choice)}>
                  {t(`reports.${choice}`)}
                </button>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={() => onExport(section.name)} disabled={exporting} aria-label={t('reports.exportSection', { title: section.title })}>
            {t('reports.exportCsv')}
          </Button>
        </div>
      </div>
      {view === 'chart' && section.bars ? (
        <ul className={dashboard.bars}>
          {section.bars.map((bar) => (
            <li key={bar.label} className={dashboard.bar}>
              <span className={dashboard.barLabel}>{bar.label}</span>
              <span className={dashboard.barTrack} aria-hidden="true">
                <span className={dashboard.barFill} style={{ width: `${(bar.value / widest) * 100}%` }} />
              </span>
              <span className={dashboard.barValue}>{bar.value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className={dashboard.tableContainer}>
          <table className={dashboard.table}>
            <thead>
              <tr>
                {section.header.map((h, i) => (
                  <th key={`${h}-${i}`} scope="col" className={i > 0 ? dashboard.numeric : undefined}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) =>
                    i === 0 ? (
                      <th key={i} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={i} className={dashboard.numeric}>
                        {cell}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const WorkingList: React.FC<{
  name: ReportName;
  title: string;
  dateLabel: string;
  rows: WorkingListRow[];
  tenantSlug: string;
  onExport: (name: ReportName) => void;
  exporting: boolean;
  tierLabel: (tier: string) => string;
}> = ({ name, title, dateLabel, rows, tenantSlug, onExport, exporting, tierLabel }) => {
  const { t } = useTranslation('members');
  const dates = useDateFormat();
  return (
    <section className={`${dashboard.panel} ${styles.listPanel}`} aria-label={title} data-report={name}>
      <div className={dashboard.panelHeader}>
        <h2 className={dashboard.panelTitle}>
          {title} <span className={members.muted}>({rows.length})</span>
        </h2>
        <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={() => onExport(name)} disabled={exporting || rows.length === 0} aria-label={t('reports.exportSection', { title })}>
          {t('reports.exportCsv')}
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className={styles.empty}>{t('reports.lists.empty')}</p>
      ) : (
        <div className={dashboard.tableContainer}>
          <table className={dashboard.table}>
            <thead>
              <tr>
                <th scope="col">{t('reports.columns.member')}</th>
                <th scope="col">{t('reports.columns.tier')}</th>
                <th scope="col">{dateLabel}</th>
                <th scope="col">{t('reports.columns.company')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.memberId}>
                  <th scope="row">
                    <Link className={members.memberLink} to={`/${tenantSlug}/members/${row.memberId}`}>
                      {row.firstName} {row.lastName}
                    </Link>
                    <div className={members.muted}>{row.memberNumber}</div>
                  </th>
                  <td>{tierLabel(row.tier)}</td>
                  <td className={styles.listRowDate}>{row.date ? dates.date(dayAsDate(row.date)) : dash}</td>
                  <td>{row.employer?.name ?? dash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

/**
 * The Wellness+ reports page (FR-RPT-01..10): the period and the filters, the figures as tiles that say whether
 * they follow the period, each report as a chart and a table with its own CSV export, and the working lists.
 * The server calculates every figure; this page writes them in the user's language and never adds them up.
 */
export const MembershipReportsContent: React.FC = () => {
  const { t, i18n } = useTranslation('members');
  const { tenantSlug = '' } = useParams();
  const { format: formatMoney } = useMoneyFormat();
  const tierOf = useTierLabels(tenantSlug);
  const areas = useActiveLookups('areas');

  const [preset, setPreset] = useState<ReportPreset>('THIS_MONTH');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filters, setFilters] = useState<ReportFilters>(NO_FILTERS);
  const cities = useActiveLookups('cities', filters.areaId ? { areaId: filters.areaId } : undefined);
  const [report, setReport] = useState<MembershipReport | null>(null);
  const [employerOptions, setEmployerOptions] = useState<EmployerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);

  const customReady = preset !== 'CUSTOM' || (from !== '' && to !== '' && from <= to);
  const params = useMemo(() => ({ preset, ...(preset === 'CUSTOM' ? { from, to } : {}), ...filters }), [preset, from, to, filters]);
  const paramsKey = JSON.stringify(params);

  const load = useCallback(async () => {
    if (!tenantSlug || !customReady) return;
    setLoading(true);
    setFailed(false);
    try {
      const result = await membershipReportService.get(tenantSlug, JSON.parse(paramsKey));
      setReport(result);
      // The employer filter lists the companies that have members; it is filled from an unfiltered-by-company read.
      if (!JSON.parse(paramsKey).employerClientId) setEmployerOptions(result.employers.rows);
    } catch (error) {
      console.error('Failed to load the Wellness+ reports', error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, paramsKey, customReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = async (name: ReportName) => {
    setExporting(true);
    try {
      downloadBlob(await membershipReportService.downloadCsv(tenantSlug, name, JSON.parse(paramsKey)), `wellness-plus-${name}.csv`);
    } catch (error) {
      console.error('Failed to export the report', error);
    } finally {
      setExporting(false);
    }
  };

  const set = <K extends keyof ReportFilters>(name: K, value: ReportFilters[K]) => setFilters((f) => ({ ...f, [name]: value }));
  const locale = i18n.language.startsWith('sq') ? 'sq-AL' : 'en-GB';
  const { number, percent } = writers(locale);
  const tierLabel = (tier: string) => tierOf(tier as never).label;
  const pathLabel = (path: string) => path.split('>').map(tierLabel).join(' → ');
  const sections = report ? buildSections(report, { t, number, percent, money: formatMoney, tier: tierLabel, path: pathLabel }) : [];
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  const tiles = report
    ? [
        { key: 'active', label: t('reports.tiles.active'), value: number(report.active.total), basis: 'asOfNow' },
        { key: 'new', label: t('reports.tiles.new'), value: number(report.newMembers.total), basis: 'period' },
        { key: 'newPaid', label: t('reports.tiles.newPaid'), value: number(report.newMembers.newPaidMemberships), basis: 'period' },
        { key: 'rate', label: t('reports.tiles.rate'), value: percent(report.renewals.rate), basis: 'period' },
        { key: 'upgrades', label: t('reports.tiles.upgrades'), value: number(report.upgrades.count), basis: 'period' },
        { key: 'downgrades', label: t('reports.tiles.downgrades'), value: number(report.downgrades.total), basis: 'period' },
        { key: 'expiring', label: t('reports.tiles.expiring'), value: number(report.lists.expiring.length), basis: 'asOfNow' },
        ...(report.revenue ? [{ key: 'revenue', label: t('reports.tiles.revenue'), value: formatMoney(report.revenue.total), basis: 'period' }] : []),
      ]
    : [];

  return (
    <div className={members.container}>
      <div className={members.header}>
        <div>
          <div className={members.breadcrumb}>{t('breadcrumb')}</div>
          <h1 className={members.title}>{t('reports.page.title')}</h1>
          <p className={members.subtitle}>{t('reports.page.subtitle')}</p>
        </div>
      </div>

      <div className={members.card}>
        <div className={members.filters}>
          <PeriodSelector
            preset={preset as never}
            from={from}
            to={to}
            onPreset={(value) => setPreset(value as ReportPreset)}
            onFrom={setFrom}
            onTo={setTo}
          />
          <SelectInput label={t('reports.filters.tier')} value={filters.tier} onChange={(e) => set('tier', e.target.value as ReportFilters['tier'])}>
            <option value="">{t('list.filters.any')}</option>
            {TIERS.map((value) => (
              <option key={value} value={value}>
                {tierLabel(value)}
              </option>
            ))}
          </SelectInput>
          <SelectInput label={t('reports.filters.segment')} value={filters.segment} onChange={(e) => set('segment', e.target.value as ReportFilters['segment'])}>
            <option value="">{t('list.filters.any')}</option>
            <option value="CORPORATE">{t('reports.segment.CORPORATE')}</option>
            <option value="INDIVIDUAL">{t('reports.segment.INDIVIDUAL')}</option>
          </SelectInput>
          <SelectInput label={t('reports.filters.employer')} value={filters.employerClientId} onChange={(e) => set('employerClientId', e.target.value)}>
            <option value="">{t('list.filters.any')}</option>
            {employerOptions.map((row) => (
              <option key={row.companyId} value={row.companyId}>
                {row.name ?? row.companyId}
              </option>
            ))}
          </SelectInput>
          <SelectInput label={t('reports.filters.area')} value={filters.areaId} onChange={(e) => setFilters((f) => ({ ...f, areaId: e.target.value, cityId: '' }))}>
            <option value="">{t('reports.filters.allAreas')}</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {lookupLabel(area, i18n.language)}
              </option>
            ))}
          </SelectInput>
          <SelectInput label={t('reports.filters.city')} value={filters.cityId} onChange={(e) => set('cityId', e.target.value)}>
            <option value="">{t('reports.filters.allCities')}</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {lookupLabel(city, i18n.language)}
              </option>
            ))}
          </SelectInput>
          {filtered && (
            <Button variant="ghost" onClick={() => setFilters(NO_FILTERS)}>
              {t('list.filters.clear')}
            </Button>
          )}
        </div>
      </div>

      {failed && (
        <div className={styles.error} role="alert">
          {t('reports.page.loadFailed')}
        </div>
      )}

      {report && !failed && (
        <>
          <ul className={dashboard.tiles} aria-busy={loading}>
            {tiles.map((tile) => (
              <li key={tile.key} className={dashboard.tile} data-figure={tile.key}>
                <div className={dashboard.tileBody}>
                  <span className={dashboard.tileLabel}>{tile.label}</span>
                  <span className={dashboard.tileValue}>{tile.value}</span>
                  <span className={dashboard.tileBasis} data-basis={tile.basis}>
                    {tile.basis === 'asOfNow' ? t('reports.asOfNow') : t(`reports.presets.${report.period.preset}`)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className={styles.sections}>
            {sections.map((section) => (
              <SectionPanel key={section.name} section={section} onExport={(name) => void exportCsv(name)} exporting={exporting} />
            ))}
            <WorkingList name="expiring" title={t('reports.lists.expiring')} dateLabel={t('reports.lists.expiringDate')} rows={report.lists.expiring} tenantSlug={tenantSlug} onExport={(n) => void exportCsv(n)} exporting={exporting} tierLabel={tierLabel} />
            <WorkingList name="vip-reviews" title={t('reports.lists.vipReviews')} dateLabel={t('reports.lists.vipDate')} rows={report.lists.vipReviews} tenantSlug={tenantSlug} onExport={(n) => void exportCsv(n)} exporting={exporting} tierLabel={tierLabel} />
            <WorkingList name="former-employees" title={t('reports.lists.formerEmployees')} dateLabel={t('reports.lists.leftDate')} rows={report.lists.formerEmployees} tenantSlug={tenantSlug} onExport={(n) => void exportCsv(n)} exporting={exporting} tierLabel={tierLabel} />
          </div>
        </>
      )}
    </div>
  );
};
