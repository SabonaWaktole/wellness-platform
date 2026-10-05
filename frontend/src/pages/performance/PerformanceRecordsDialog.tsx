import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Modal } from '../../components/ui/Modal/Modal';
import { Pagination } from '../../components/ui/Pagination/Pagination';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { performanceService } from '../../services/performanceService';
import type { PerformanceFilters, PerformanceIndicator, PerformanceRecord, PerformanceRecordsPage } from '../../types/performance';
import { dayAsDate } from '../../components/calendar/calendarGrouping';
import { indicatorKey } from './performanceColumns';
import styles from './PerformanceContent.module.css';

const PAGE_SIZE = 20;

export interface RecordsTarget {
  indicator: PerformanceIndicator;
  /** Whose records: one salesperson, or the whole selection. */
  salespersonId?: string;
  salespersonName?: string;
}

interface Props {
  target: RecordsTarget | null;
  filters: PerformanceFilters;
  onClose: () => void;
}

/**
 * The activities, offers, deals or follow-ups behind one figure (FR-PRF-07), read with the same period
 * and the same salespeople as the table, so "Visits: 5" lists five visits. The server decides what a
 * viewer may list; a deal's value is absent without `commercial.view`.
 */
export const PerformanceRecordsDialog: React.FC<Props> = ({ target, filters, onClose }) => {
  const { t } = useTranslation('performance');
  const dates = useDateFormat();
  const { format: formatMoney } = useMoneyFormat();
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PerformanceRecordsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const filterKey = JSON.stringify({ target, filters });

  useEffect(() => {
    setPage(1);
  }, [filterKey]);

  useEffect(() => {
    if (!target || !tenantSlug) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const scoped: PerformanceFilters = target.salespersonId ? { ...filters, salespersonIds: [target.salespersonId] } : filters;
    performanceService
      .fetchRecords(tenantSlug, scoped, target.indicator, page, PAGE_SIZE)
      .then((data) => !cancelled && setResult(data))
      .catch((error) => {
        console.error('Failed to load the records', error);
        if (!cancelled) setFailed(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // `filterKey` stands for target and filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, tenantSlug]);

  const open = (record: PerformanceRecord) =>
    navigate(record.kind === 'DEAL' ? `/${tenantSlug}/deals/${record.dealId ?? record.id}` : `/${tenantSlug}/clients/${record.clientId}`);

  /** An activity type, offer or follow-up status, or WON / LOST for a deal: translated, or as the server sent it. */
  const detail = (record: PerformanceRecord): string => (record.detail ? t(`recordDetail.${record.detail}`, { defaultValue: record.detail }) : '—');

  const rows = result?.rows ?? [];
  const showsValue = rows.some((row) => row.annualValue);

  return (
    <Modal
      isOpen={target !== null}
      onClose={onClose}
      maxWidth="xl"
      title={
        target
          ? t('recordsTitle', {
              indicator: t(`indicators.${indicatorKey(target.indicator)}`),
              name: target.salespersonName ?? t('totalRow'),
            })
          : ''
      }
    >
      {target && result && (
        <p className={styles.recordsPeriod}>
          {dates.date(dayAsDate(result.period.from))} – {dates.date(dayAsDate(result.period.to))}
        </p>
      )}
      {failed ? (
        <p role="alert">{t('recordsFailed')}</p>
      ) : !loading && rows.length === 0 ? (
        <p>{t('recordsEmpty')}</p>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.recordsTable}>
            <thead>
              <tr>
                <th>{t('recordDate')}</th>
                <th>{t('recordCompany')}</th>
                <th>{t('recordKind')}</th>
                <th>{t('recordSalesperson')}</th>
                {showsValue && <th className={styles.numeric}>{t('recordValue')}</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={showsValue ? 5 : 4}>{t('loading')}</td>
                </tr>
              )}
              {!loading &&
                rows.map((record) => (
                  <tr key={`${record.kind}-${record.id}`} className={styles.recordRow} onClick={() => open(record)}>
                    <td>{dates.date(record.at)}</td>
                    <td>
                      {record.companyName}
                      {record.label && <span className={styles.muted}> · {record.label}</span>}
                    </td>
                    <td>{detail(record)}</td>
                    <td>{record.salesperson.name}</td>
                    {showsValue && <td className={styles.numeric}>{record.annualValue ? formatMoney(record.annualValue) : '—'}</td>}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {(result?.count ?? 0) > PAGE_SIZE && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={result!.count} onPageChange={setPage} itemLabel={t('records')} />
      )}
    </Modal>
  );
};
