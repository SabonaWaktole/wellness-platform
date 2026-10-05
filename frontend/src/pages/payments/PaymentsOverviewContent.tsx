import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Download, Search, Banknote } from 'lucide-react';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { Button } from '../../components/ui/Button/Button';
import { StatusBadge } from '../../components/ui/StatusBadge/StatusBadge';
import { Pagination } from '../../components/ui/Pagination/Pagination';
import { useActiveLookups } from '../../hooks/useActiveLookups';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useDebounce } from '../../hooks/useDebounce';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { usePermission } from '../../hooks/usePermission';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { useTeam } from '../../hooks/useTeam';
import { paymentService } from '../../services/paymentService';
import { downloadBlob } from '../../utils/downloadBlob';
import { lookupLabel } from '../../utils/lookupLabel';
import { getStaffDisplayName } from '../../utils/userUtils';
import { contractReference } from '../../utils/contractReference';
import { PaymentStatus } from '../../types/contract';
import type { PaymentFilters, PaymentsPage } from '../../types/payment';
import styles from './PaymentsOverviewContent.module.css';

const PAGE_SIZE = 25;

/** The statuses to filter by: the ones an instalment can be in today, not the legacy Waived. */
const STATUS_FILTERS = Object.values(PaymentStatus).filter((status) => status !== PaymentStatus.WAIVED);

/**
 * The Payments overview (FR-PAY-11): the instalments in the viewer's scope with
 * filters, the totals of the whole filtered list as the server worked them out,
 * and the same filters as a CSV file (FR-PAY-14). It shows what the server
 * sends and works nothing out; without `commercial.view` the amounts and the
 * totals are absent, and so are their columns.
 */
export const PaymentsOverviewContent: React.FC = () => {
  const { t, i18n } = useTranslation('payments');
  const { t: tc } = useTranslation('common');
  const dates = useDateFormat();
  const { format: formatMoney } = useMoneyFormat();
  const statusLabel = useStatusLabel();
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { staff, fetchStaff } = useTeam();
  const areas = useActiveLookups('areas');

  // A link from a contract or a company opens the overview already filtered.
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [query, setQuery] = useState('');
  const [salespersonId, setSalespersonId] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [onlyDueNotInvoiced, setOnlyDueNotInvoiced] = useState(params.get('dueNotInvoiced') === 'true');
  const [areaId, setAreaId] = useState('');
  const [cityId, setCityId] = useState('');
  const contractId = params.get('contractId') ?? '';
  const clientId = params.get('clientId') ?? '';
  const cities = useActiveLookups('cities', areaId ? { areaId } : undefined);

  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PaymentsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);

  const debouncedQuery = useDebounce(query, 300);
  const showsAmounts = usePermission('commercial.view');

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const filters: PaymentFilters = {
    status: status || undefined,
    query: debouncedQuery.trim() || undefined,
    contractId: contractId || undefined,
    clientId: clientId || undefined,
    assignedUserId: salespersonId || undefined,
    dueFrom: dueFrom || undefined,
    dueTo: dueTo || undefined,
    dueNotInvoiced: onlyDueNotInvoiced ? 'true' : undefined,
    areaId: areaId || undefined,
    cityId: cityId || undefined,
  };
  const filterKey = JSON.stringify(filters);

  // A new filter starts again from the first page.
  useEffect(() => {
    setPage(1);
  }, [filterKey]);

  const load = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setFailed(false);
    try {
      setResult(await paymentService.fetchPayments(tenantSlug, JSON.parse(filterKey), page, PAGE_SIZE));
    } catch (error) {
      console.error('Failed to load payments', error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, filterKey, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = async () => {
    if (!tenantSlug) return;
    setExporting(true);
    try {
      const blob = await paymentService.downloadCsv(tenantSlug, filters);
      downloadBlob(blob, `payments-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      console.error('Failed to export payments', error);
      setFailed(true);
    } finally {
      setExporting(false);
    }
  };

  const rows = result?.data ?? [];
  const totals = result?.totals ?? {};
  const hasTotals = totals.amount !== undefined;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('breadcrumb')}</div>
          <h1 className={styles.title}>{t('title')}</h1>
        </div>
        <Button variant="outline" icon={<Download size={16} />} onClick={exportCsv} disabled={exporting || rows.length === 0}>
          {t('exportCsv')}
        </Button>
      </div>

      <div className={styles.card}>
        <div className={styles.filters}>
          <TextInput
            label={t('filterSearch')}
            placeholder={t('searchPlaceholder')}
            iconLeft={<Search size={18} />}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <SelectInput label={t('filterStatus')} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">{t('all')}</option>
            {STATUS_FILTERS.map((key) => (
              <option key={key} value={key}>
                {statusLabel.contractPayment(key)}
              </option>
            ))}
          </SelectInput>
          <SelectInput label={t('filterSalesperson')} value={salespersonId} onChange={(event) => setSalespersonId(event.target.value)}>
            <option value="">{t('all')}</option>
            {staff.map((person: any) => (
              <option key={person.id} value={person.id}>
                {getStaffDisplayName(person)}
              </option>
            ))}
          </SelectInput>
          <TextInput label={t('filterDueFrom')} type="date" value={dueFrom} onChange={(event) => setDueFrom(event.target.value)} />
          <TextInput label={t('filterDueTo')} type="date" value={dueTo} onChange={(event) => setDueTo(event.target.value)} />
          <SelectInput
            label={t('filterArea')}
            value={areaId}
            onChange={(event) => {
              setAreaId(event.target.value);
              setCityId('');
            }}
          >
            <option value="">{t('all')}</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {lookupLabel(area, i18n.language)}
              </option>
            ))}
          </SelectInput>
          <SelectInput label={t('filterCity')} value={cityId} onChange={(event) => setCityId(event.target.value)}>
            <option value="">{t('all')}</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {lookupLabel(city, i18n.language)}
              </option>
            ))}
          </SelectInput>
          <label className={styles.filterCheck}>
            <input type="checkbox" checked={onlyDueNotInvoiced} onChange={(event) => setOnlyDueNotInvoiced(event.target.checked)} />
            {t('filterDueNotInvoiced')}
          </label>
        </div>

        {showsAmounts && (
          <div className={styles.totals} aria-label={t('totalsLabel')}>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>{t('totalAmount')}</span>
              <span className={styles.tileValue}>{hasTotals ? formatMoney(totals.amount) : '—'}</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>{t('totalReceived')}</span>
              <span className={styles.tileValue}>{hasTotals ? formatMoney(totals.paidAmount) : '—'}</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>{t('totalOutstanding')}</span>
              <span className={`${styles.tileValue} ${styles.tileOwed}`}>{hasTotals ? formatMoney(totals.outstanding) : '—'}</span>
            </div>
          </div>
        )}

        <div className={styles.tableContainer}>
          {failed ? (
            <div className={styles.emptyState} role="alert">
              <h3 className={styles.emptyTitle}>{t('failed')}</h3>
            </div>
          ) : !loading && rows.length === 0 ? (
            <div className={styles.emptyState}>
              <Banknote size={48} className={styles.emptyIcon} />
              <h3 className={styles.emptyTitle}>{t('empty')}</h3>
              <p className={styles.emptyMessage}>{t('emptyMessage')}</p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('columnContract')}</th>
                  <th>{t('columnCompany')}</th>
                  <th>{t('columnSalesperson')}</th>
                  <th>{t('columnDue')}</th>
                  <th>{t('columnStatus')}</th>
                  <th>{t('columnInvoice')}</th>
                  {showsAmounts && <th className={styles.numeric}>{t('columnAmount')}</th>}
                  {showsAmounts && <th className={styles.numeric}>{t('columnReceived')}</th>}
                  {showsAmounts && <th className={styles.numeric}>{t('columnOutstanding')}</th>}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={showsAmounts ? 9 : 6} className={styles.loadingCell}>
                      {tc('state.loading')}
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`${styles.row} ${row.status === 'OVERDUE' ? styles.rowOverdue : ''}`}
                      onClick={() => navigate(`/${tenantSlug}/contracts/${row.contract.id}`)}
                    >
                      <td>
                        <a
                          className={styles.contractLink}
                          href={`/${tenantSlug}/contracts/${row.contract.id}`}
                          onClick={(event) => {
                            // The row opens the contract; the link must not open it twice.
                            event.preventDefault();
                            event.stopPropagation();
                            navigate(`/${tenantSlug}/contracts/${row.contract.id}`);
                          }}
                        >
                          {row.contract.number ?? contractReference(row.contract.id)}
                        </a>
                        <span className={styles.muted}> #{row.periodIndex}</span>
                      </td>
                      <td>{row.client.name}</td>
                      <td>{row.salesperson?.name ?? '—'}</td>
                      <td>
                        {dates.date(row.dueDate)}
                        {row.dueNotInvoiced && <span className={styles.flag}>{t('dueNotInvoiced')}</span>}
                      </td>
                      <td>
                        <StatusBadge domain="payment" status={row.status} />
                      </td>
                      <td className={styles.muted}>{row.invoiceNumber ?? '—'}</td>
                      {showsAmounts && <td className={styles.numeric}>{row.amount !== undefined ? formatMoney(row.amount) : '—'}</td>}
                      {showsAmounts && <td className={`${styles.numeric} ${styles.muted}`}>{row.paidAmount !== undefined ? formatMoney(row.paidAmount) : '—'}</td>}
                      {showsAmounts && <td className={styles.numeric}>{row.outstanding !== undefined ? formatMoney(row.outstanding) : '—'}</td>}
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        {(result?.total ?? 0) > 0 && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={result!.total} onPageChange={setPage} itemLabel={t('items')} />
        )}
      </div>
    </div>
  );
};
