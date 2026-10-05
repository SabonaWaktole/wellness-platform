import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FileText, Search } from 'lucide-react';
import { Badge } from '../../components/ui/Badge/Badge';
import { Button } from '../../components/ui/Button/Button';
import { Card } from '../../components/ui/Card/Card';
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable/DataTable';
import { Pagination } from '../../components/ui/Pagination/Pagination';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { useDebounce } from '../../hooks/useDebounce';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { usePermissionScope } from '../../hooks/usePermission';
import { useTeam } from '../../hooks/useTeam';
import { offerService } from '../../services/offerService';
import { OFFER_STATUSES, type OfferListParams, type OfferPage, type OfferStatus, type OfferView } from '../../types/offer';
import { getStaffDisplayName } from '../../utils/userUtils';
import styles from '../deals/DealListContent.module.css';

/**
 * The offers list (FR-OFR-14): filtered by status, salesperson, company or
 * number, and creation date, paged on the server and inside the viewer's
 * scope, so a Sales User sees only their own deals' offers. The salesperson
 * filter is offered only to someone who sees more than their own. A row
 * opens the offer's deal, where it is previewed, downloaded and moved on.
 */
export const OfferListContent: React.FC = () => {
  const { t } = useTranslation('offers');
  const { t: td } = useTranslation('deals');
  const { tenantSlug } = useParams();
  // A dashboard figure opens the list already filtered: `?status=SENT` (M3 Slice 14, FR-DSH-05).
  const [startFilters] = useSearchParams();
  const navigate = useNavigate();
  const dates = useDateFormat();
  const money = useMoneyFormat();
  const seesOthers = (usePermissionScope('commercial.view') ?? 'OWN') !== 'OWN';
  const { staff, fetchStaff } = useTeam();

  const [query, setQuery] = useState('');
  const [statuses, setStatuses] = useState<OfferStatus[]>(() => startFilters.getAll('status').filter((status): status is OfferStatus => (OFFER_STATUSES as readonly string[]).includes(status)));
  const [ownerUserId, setOwnerUserId] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState<OfferPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const latest = useRef(0);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (seesOthers) fetchStaff();
  }, [seesOthers, fetchStaff]);

  const params: OfferListParams = useMemo(
    () => ({
      q: debouncedQuery.trim() || undefined,
      status: statuses,
      ownerUserId: ownerUserId || undefined,
      createdFrom: createdFrom || undefined,
      createdTo: createdTo || undefined,
      page,
      pageSize,
    }),
    [debouncedQuery, statuses, ownerUserId, createdFrom, createdTo, page, pageSize]
  );

  useEffect(() => {
    if (!tenantSlug) return;
    const request = ++latest.current;
    setIsLoading(true);
    offerService
      .list(tenantSlug, params)
      .then((found) => {
        if (request !== latest.current) return;
        setResult(found);
        setLoadFailed(false);
      })
      .catch(() => request === latest.current && setLoadFailed(true))
      .finally(() => request === latest.current && setIsLoading(false));
  }, [tenantSlug, params]);

  const filter =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPage(1);
    };
  const toggle = (status: OfferStatus) =>
    filter(setStatuses)(statuses.includes(status) ? statuses.filter((s) => s !== status) : [...statuses, status]);

  const hasFilters = !!query || statuses.length > 0 || !!ownerUserId || !!createdFrom || !!createdTo;
  const clearFilters = () => {
    setQuery('');
    setStatuses([]);
    setOwnerUserId('');
    setCreatedFrom('');
    setCreatedTo('');
    setPage(1);
  };

  const columns: DataTableColumn<OfferView>[] = [
    {
      id: 'reference',
      header: t('list.columns.reference'),
      cardLabel: null,
      render: (offer) => (
        <span>
          <strong>{offer.reference}</strong> · {offer.companyName}
        </span>
      ),
    },
    {
      id: 'status',
      header: t('list.columns.status'),
      render: (offer) => (
        <span>
          <Badge variant={offer.status === 'DRAFT' ? 'outline' : 'secondary'}>{td(`offers.status.${offer.status}`, { defaultValue: offer.status })}</Badge>
          {offer.superseded && <> {t('superseded')}</>}
        </span>
      ),
    },
    { id: 'salesperson', header: t('list.columns.salesperson'), render: (offer) => offer.dealOwnerName },
    {
      id: 'price',
      header: t('list.columns.price'),
      render: (offer) =>
        offer.netMonthlyPrice != null
          ? td('perMonth', { amount: money.format(Number(offer.netMonthlyPrice)) })
          : offer.priceOnRequest
            ? td('offers.priceOnRequest')
            : '—',
    },
    {
      id: 'validUntil',
      header: t('list.columns.validUntil'),
      render: (offer) => (offer.validUntil ? dates.date(`${offer.validUntil}T12:00:00.000Z`) : '—'),
    },
    { id: 'created', header: t('list.columns.created'), render: (offer) => dates.date(offer.createdAt) },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('list.breadcrumb')}</div>
          <h1 className={styles.title}>{t('list.title')}</h1>
        </div>
      </div>

      <Card padding="lg" className={styles.filters}>
        <div className={styles.filterRow}>
          <TextInput
            aria-label={t('list.searchLabel')}
            placeholder={t('list.searchPlaceholder')}
            iconLeft={<Search size={16} />}
            value={query}
            onChange={(e) => filter(setQuery)(e.target.value)}
          />
        </div>
        <div className={styles.chipRow} role="group" aria-label={t('list.statuses')}>
          {OFFER_STATUSES.map((status) => (
            <button key={status} type="button" className={styles.chip} aria-pressed={statuses.includes(status)} onClick={() => toggle(status)}>
              {td(`offers.status.${status}`, { defaultValue: status })}
            </button>
          ))}
        </div>
        <div className={styles.selectRow}>
          {seesOthers && (
            <SelectInput aria-label={t('list.salesperson')} value={ownerUserId} onChange={(e) => filter(setOwnerUserId)(e.target.value)}>
              <option value="">{t('list.allSalespeople')}</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {getStaffDisplayName(member)}
                </option>
              ))}
            </SelectInput>
          )}
          <TextInput type="date" label={t('list.createdFrom')} value={createdFrom} onChange={(e) => filter(setCreatedFrom)(e.target.value)} />
          <TextInput type="date" label={t('list.createdTo')} value={createdTo} onChange={(e) => filter(setCreatedTo)(e.target.value)} />
        </div>
        {hasFilters && (
          <div>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              {t('list.clear')}
            </Button>
          </div>
        )}
      </Card>

      {loadFailed && <p className={styles.message}>{t('list.loadFailed')}</p>}

      <Card padding="none" className={styles.tableCard}>
        <DataTable
          columns={columns}
          rows={result?.data ?? []}
          rowKey={(offer) => offer.id}
          isLoading={isLoading && !result}
          onRowClick={(offer) => navigate(`/${tenantSlug}/deals/${offer.dealId}`)}
          empty={{
            icon: <FileText size={28} />,
            title: hasFilters ? t('list.emptyFiltered') : t('list.empty'),
            description: hasFilters ? t('list.emptyFilteredMessage') : t('list.emptyMessage'),
          }}
        />
      </Card>

      {result && result.total > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={result.total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          pageSizeOptions={[25, 50, 100]}
          itemLabel={t('list.itemLabel')}
        />
      )}
    </div>
  );
};
