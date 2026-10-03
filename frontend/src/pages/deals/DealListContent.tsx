import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Briefcase, Plus, Search } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Card } from '../../components/ui/Card/Card';
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable/DataTable';
import { Pagination } from '../../components/ui/Pagination/Pagination';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { StatusBadge } from '../../components/ui/StatusBadge/StatusBadge';
import { Can } from '../../components/auth/Can';
import { useActiveLookups } from '../../hooks/useActiveLookups';
import { useDebounce } from '../../hooks/useDebounce';
import { useDealText } from '../../hooks/useDealText';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { usePermission, usePermissionScope } from '../../hooks/usePermission';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { useTeam } from '../../hooks/useTeam';
import { dealService } from '../../services/dealService';
import { lookupLabel } from '../../utils/lookupLabel';
import { getStaffDisplayName } from '../../utils/userUtils';
import { DEAL_STAGES, DEAL_TYPES } from '../../types/deal';
import type { DealListParams, DealPage, DealSortField, DealStage, DealSummary, DealType } from '../../types/deal';
import { PipelineViewSwitch } from './PipelineViewSwitch';
import styles from './DealListContent.module.css';

const DEFAULT_SORT: { field: DealSortField; direction: 'asc' | 'desc' } = { field: 'updatedAt', direction: 'desc' };

/** A monthly value as the server reads it: "40" or "49.40". */
const AMOUNT = /^\d{1,10}(\.\d{1,2})?$/;
const amountOrUndefined = (value: string) => (AMOUNT.test(value.trim()) ? value.trim() : undefined);

/**
 * The pipeline as a list (FR-DEAL-11): filtered by salesperson, stage, type,
 * business type, area, city and expected close date, sorted and paged on the
 * server, inside the viewer's scope. The salesperson filter is offered only
 * to someone who sees more than their own deals; the value filter and sort,
 * the net monthly value of the deal's offer (Slice 8), only to someone who
 * may see values (FR-RBAC-17).
 */
export const DealListContent: React.FC = () => {
  const { t, i18n } = useTranslation('deals');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const statusLabel = useStatusLabel();
  const text = useDealText();
  const dates = useDateFormat();
  const money = useMoneyFormat();
  const canSeeValues = usePermission('commercial.view');
  const seesOthers = usePermissionScope('deals.view') !== 'OWN';
  const { staff, fetchStaff } = useTeam();

  const [query, setQuery] = useState('');
  const [stages, setStages] = useState<DealStage[]>([]);
  const [types, setTypes] = useState<DealType[]>([]);
  const [ownerUserId, setOwnerUserId] = useState('');
  const [businessTypeId, setBusinessTypeId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [cityId, setCityId] = useState('');
  const [closeFrom, setCloseFrom] = useState('');
  const [closeTo, setCloseTo] = useState('');
  const [valueMin, setValueMin] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState<DealPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const latest = useRef(0);

  const businessTypes = useActiveLookups('business-types');
  const areas = useActiveLookups('areas');
  const cities = useActiveLookups('cities', areaId ? { areaId } : undefined);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (seesOthers) fetchStaff();
  }, [seesOthers, fetchStaff]);

  const params: DealListParams = useMemo(
    () => ({
      q: debouncedQuery.trim() || undefined,
      stage: stages,
      type: types,
      ownerUserId: ownerUserId || undefined,
      businessTypeId: businessTypeId || undefined,
      areaId: areaId || undefined,
      cityId: cityId || undefined,
      expectedCloseFrom: closeFrom || undefined,
      expectedCloseTo: closeTo || undefined,
      valueMin: canSeeValues ? amountOrUndefined(valueMin) : undefined,
      valueMax: canSeeValues ? amountOrUndefined(valueMax) : undefined,
      sort: sort.field,
      direction: sort.direction,
      page,
      pageSize,
    }),
    [debouncedQuery, stages, types, ownerUserId, businessTypeId, areaId, cityId, closeFrom, closeTo, valueMin, valueMax, canSeeValues, sort, page, pageSize]
  );

  useEffect(() => {
    if (!tenantSlug) return;
    const request = ++latest.current;
    setIsLoading(true);
    dealService
      .list(tenantSlug, params)
      .then((page) => {
        if (request !== latest.current) return;
        setResult(page);
        setLoadFailed(false);
      })
      .catch(() => request === latest.current && setLoadFailed(true))
      .finally(() => request === latest.current && setIsLoading(false));
  }, [tenantSlug, params]);

  /** Every filter change starts again from the first page. */
  const filter =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPage(1);
    };
  const toggle = <T,>(list: T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const hasFilters =
    !!query || stages.length > 0 || types.length > 0 || !!ownerUserId || !!businessTypeId || !!areaId || !!cityId || !!closeFrom || !!closeTo || !!valueMin || !!valueMax;
  const clearFilters = () => {
    setQuery('');
    setStages([]);
    setTypes([]);
    setOwnerUserId('');
    setBusinessTypeId('');
    setAreaId('');
    setCityId('');
    setCloseFrom('');
    setCloseTo('');
    setValueMin('');
    setValueMax('');
    setPage(1);
  };

  const onSort = (field: string) => {
    const next = field as DealSortField;
    setSort((current) =>
      current.field === next
        ? { field: next, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { field: next, direction: next === 'updatedAt' || next === 'value' ? 'desc' : 'asc' }
    );
    setPage(1);
  };

  const columns: DataTableColumn<DealSummary>[] = [
    {
      id: 'title',
      header: t('list.columns.deal'),
      sortable: true,
      cardLabel: null,
      render: (deal) => (
        <div className={styles.dealCell}>
          <span className={styles.dealTitle}>{text.title(deal)}</span>
          <span className={styles.dealCompany}>{deal.companyName}</span>
        </div>
      ),
    },
    { id: 'stage', header: t('list.columns.stage'), render: (deal) => <StatusBadge domain="deal" status={deal.stage} /> },
    { id: 'owner', header: t('list.columns.salesperson'), render: (deal) => deal.ownerName },
    {
      id: 'expectedCloseDate',
      header: t('list.columns.expectedClose'),
      sortable: true,
      nowrap: true,
      render: (deal) => text.calendarDate(deal.expectedCloseDate) ?? '—',
    },
    ...(canSeeValues
      ? [
          {
            id: 'value',
            header: t('list.columns.value'),
            sortable: true,
            align: 'right' as const,
            nowrap: true,
            render: (deal: DealSummary) =>
              deal.netMonthlyPrice === null || deal.netMonthlyPrice === undefined ? '—' : money.format(Number(deal.netMonthlyPrice)),
          },
        ]
      : []),
    {
      id: 'updatedAt',
      header: t('list.columns.updated'),
      sortable: true,
      nowrap: true,
      hideOnCard: true,
      render: (deal) => dates.date(deal.updatedAt),
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('breadcrumb')}</div>
          <h1 className={styles.title}>{t('title')}</h1>
        </div>
        <div className={styles.headerActions}>
          <PipelineViewSwitch current="list" />
          <Can permission="deals.edit">
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate(`/${tenantSlug}/deals/new`)}>
              {t('newDeal')}
            </Button>
          </Can>
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

        <div className={styles.chipRow} role="group" aria-label={t('list.stages')}>
          {DEAL_STAGES.map((stage) => (
            <button
              key={stage}
              type="button"
              className={styles.chip}
              aria-pressed={stages.includes(stage)}
              onClick={() => filter(setStages)(toggle(stages, stage))}
            >
              {statusLabel.deal(stage)}
            </button>
          ))}
        </div>
        <div className={styles.chipRow} role="group" aria-label={t('list.types')}>
          {DEAL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={styles.chip}
              aria-pressed={types.includes(type)}
              onClick={() => filter(setTypes)(toggle(types, type))}
            >
              {statusLabel.dealType(type)}
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
          <SelectInput aria-label={t('list.businessType')} value={businessTypeId} onChange={(e) => filter(setBusinessTypeId)(e.target.value)}>
            <option value="">{t('list.allBusinessTypes')}</option>
            {businessTypes.map((item) => (
              <option key={item.id} value={item.id}>
                {lookupLabel(item, i18n.language)}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            aria-label={t('list.area')}
            value={areaId}
            onChange={(e) => {
              filter(setAreaId)(e.target.value);
              setCityId('');
            }}
          >
            <option value="">{t('list.allAreas')}</option>
            {areas.map((item) => (
              <option key={item.id} value={item.id}>
                {lookupLabel(item, i18n.language)}
              </option>
            ))}
          </SelectInput>
          <SelectInput aria-label={t('list.city')} value={cityId} onChange={(e) => filter(setCityId)(e.target.value)}>
            <option value="">{t('list.allCities')}</option>
            {cities.map((item) => (
              <option key={item.id} value={item.id}>
                {lookupLabel(item, i18n.language)}
              </option>
            ))}
          </SelectInput>
          <TextInput type="date" label={t('list.closeFrom')} value={closeFrom} onChange={(e) => filter(setCloseFrom)(e.target.value)} />
          <TextInput type="date" label={t('list.closeTo')} value={closeTo} onChange={(e) => filter(setCloseTo)(e.target.value)} />
          {canSeeValues &&
            ([
              ['valueMin', valueMin, setValueMin],
              ['valueMax', valueMax, setValueMax],
            ] as const).map(([key, value, set]) => (
              <TextInput
                key={key}
                label={t(`list.${key}`)}
                inputMode="decimal"
                value={value}
                error={value.trim() !== '' && !AMOUNT.test(value.trim()) ? t('list.valueInvalid') : undefined}
                onChange={(e) => filter(set)(e.target.value)}
              />
            ))}
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
          rows={result?.items ?? []}
          rowKey={(deal) => deal.id}
          isLoading={isLoading && !result}
          onRowClick={(deal) => navigate(`/${tenantSlug}/deals/${deal.id}`)}
          sort={{ field: sort.field, direction: sort.direction, onSort }}
          empty={{
            icon: <Briefcase size={28} />,
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
