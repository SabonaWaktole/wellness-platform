import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, FileText, Receipt } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Pagination } from '../../components/ui/Pagination/Pagination';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { dayAsDate } from '../../components/calendar/calendarGrouping';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { downloadBlob } from '../../utils/downloadBlob';
import { TIERS } from '../../services/membershipSettingsService';
import {
  memberPaymentService,
  PAYMENT_KINDS,
  PAYMENT_METHODS,
  type PaymentFilters,
  type PaymentsPage,
} from '../../services/memberPaymentService';
import { useReceipt } from './useReceipt';
import { TierBadge } from './MemberBadges';
import { useTierLabels } from './useTierLabels';
import styles from './Members.module.css';

const PAGE_SIZE = 25;
const NO_FILTERS: Required<Pick<PaymentFilters, 'from' | 'to' | 'tier' | 'kind' | 'method' | 'status'>> = {
  from: '',
  to: '',
  tier: '',
  kind: '',
  method: '',
  status: '',
};

/**
 * The Membership payments list (FR-MPAY-07): every payment with filters by date range, tier, kind, method and
 * status, and the total of the filtered list. The total is calculated by the server in the database and leaves
 * voided payments out; this screen shows it and never adds up the rows. CSV and the receipt come from the server.
 */
export const MemberPaymentsContent: React.FC = () => {
  const { t } = useTranslation('members');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const dates = useDateFormat();
  const { format: formatMoney } = useMoneyFormat();
  const tier = useTierLabels(tenantSlug);
  const openReceipt = useReceipt(tenantSlug);

  const [filters, setFilters] = useState(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PaymentsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);

  const key = JSON.stringify(filters);
  useEffect(() => {
    setPage(1);
  }, [key]);

  const load = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setFailed(false);
    try {
      setResult(await memberPaymentService.search(tenantSlug, { ...JSON.parse(key), page, limit: PAGE_SIZE }));
    } catch (error) {
      console.error('Failed to load membership payments', error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, key, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (name: keyof typeof NO_FILTERS, value: string) => setFilters((f) => ({ ...f, [name]: value }));
  const filtered = key !== JSON.stringify(NO_FILTERS);
  const rows = result?.data ?? [];

  const exportCsv = async () => {
    if (!tenantSlug) return;
    setExporting(true);
    try {
      downloadBlob(await memberPaymentService.downloadCsv(tenantSlug, filters), `membership-payments-${dates.dayKey(new Date())}.csv`);
    } catch (error) {
      console.error('Failed to export membership payments', error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('breadcrumb')}</div>
          <h1 className={styles.title}>{t('payments.page.title')}</h1>
          <p className={styles.subtitle}>{t('payments.page.subtitle')}</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="outline" icon={<Download size={16} />} onClick={() => void exportCsv()} disabled={exporting || rows.length === 0}>
            {t('payments.page.exportCsv')}
          </Button>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.filters}>
          <TextInput label={t('payments.page.from')} type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} />
          <TextInput label={t('payments.page.to')} type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} />
          <SelectInput label={t('payments.page.tier')} value={filters.tier} onChange={(e) => set('tier', e.target.value)}>
            <option value="">{t('list.filters.any')}</option>
            {TIERS.filter((v) => v === 'SILVER' || v === 'GOLD').map((value) => (
              <option key={value} value={value}>{tier(value).label}</option>
            ))}
          </SelectInput>
          <SelectInput label={t('payments.page.kind')} value={filters.kind} onChange={(e) => set('kind', e.target.value)}>
            <option value="">{t('list.filters.any')}</option>
            {PAYMENT_KINDS.map((value) => (
              <option key={value} value={value}>{t(`payments.kind.${value}`)}</option>
            ))}
          </SelectInput>
          <SelectInput label={t('payments.page.method')} value={filters.method} onChange={(e) => set('method', e.target.value)}>
            <option value="">{t('list.filters.any')}</option>
            {PAYMENT_METHODS.map((value) => (
              <option key={value} value={value}>{t(`payments.method.${value}`)}</option>
            ))}
          </SelectInput>
          <SelectInput label={t('payments.page.status')} value={filters.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">{t('list.filters.any')}</option>
            <option value="RECORDED">{t('payments.status.RECORDED')}</option>
            <option value="VOIDED">{t('payments.status.VOIDED')}</option>
          </SelectInput>
          {filtered && (
            <Button variant="ghost" onClick={() => setFilters(NO_FILTERS)}>
              {t('list.filters.clear')}
            </Button>
          )}
        </div>

        {result && (
          <div className={styles.summary} role="status">
            {t('payments.page.summary', { count: result.total })} · {t('payments.page.total')}: <strong data-testid="payments-total">{formatMoney(result.totalAmount)}</strong>
            <span className={styles.muted}> ({t('payments.page.totalNote')})</span>
          </div>
        )}

        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('payments.columns.receipt')}</th>
                <th scope="col">{t('payments.columns.date')}</th>
                <th scope="col">{t('payments.columns.member')}</th>
                <th scope="col">{t('payments.columns.kind')}</th>
                <th scope="col">{t('payments.columns.tier')}</th>
                <th scope="col">{t('payments.columns.amount')}</th>
                <th scope="col">{t('payments.columns.method')}</th>
                <th scope="col">{t('payments.columns.status')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && !result && <tr><td colSpan={8} className={styles.loadingCell}>…</td></tr>}
              {failed && <tr><td colSpan={8} className={styles.loadingCell} role="alert">{t('payments.page.loadFailed')}</td></tr>}
              {!failed && result && rows.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className={styles.emptyState}>
                      <Receipt size={32} aria-hidden />
                      <p>{filtered ? t('payments.page.emptyFiltered') : t('payments.page.empty')}</p>
                    </div>
                  </td>
                </tr>
              )}
              {!failed &&
                rows.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <button type="button" className={styles.memberLink} onClick={() => void openReceipt(payment.id)} aria-label={t('payments.openReceipt', { number: payment.receiptNumber })}>
                        <FileText size={14} aria-hidden /> {payment.receiptNumber}
                      </button>
                    </td>
                    <td>{dates.date(dayAsDate(payment.receivedOn))}</td>
                    <td>
                      <a
                        className={styles.memberLink}
                        href={`/${tenantSlug}/members/${payment.memberId}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/${tenantSlug}/members/${payment.memberId}`);
                        }}
                      >
                        {payment.memberName}
                      </a>
                      <div className={styles.muted}>{payment.memberNumber}</div>
                    </td>
                    <td>{t(`payments.kind.${payment.kind}`)}</td>
                    <td><TierBadge tier={payment.toTier} label={tier(payment.toTier).label} colour={tier(payment.toTier).colour} /></td>
                    <td>{formatMoney(payment.amount)}</td>
                    <td>{t(`payments.method.${payment.method}`)}</td>
                    <td>
                      {payment.status === 'VOIDED' ? (
                        <span className={styles.chip} title={payment.voidReason ?? undefined}>{t('payments.status.VOIDED')}</span>
                      ) : (
                        t('payments.status.RECORDED')
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {result && result.total > PAGE_SIZE && (
          <div className={styles.pager}>
            <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
};
