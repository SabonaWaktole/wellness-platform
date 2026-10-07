import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Search, Users } from 'lucide-react';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { Button } from '../../components/ui/Button/Button';
import { Pagination } from '../../components/ui/Pagination/Pagination';
import { useDebounce } from '../../hooks/useDebounce';
import { useAuthStore } from '../../store/useAuthStore';
import { TIERS } from '../../services/membershipSettingsService';
import { memberService, type MemberPage, type MemberQuery } from '../../services/memberService';
import { ExpiringBadge, StatusBadge, TierBadge } from './MemberBadges';
import { useTierLabels } from './useTierLabels';
import styles from './Members.module.css';

const PAGE_SIZE = 25;

type Filters = {
  tier: NonNullable<MemberQuery['tier']>;
  status: NonNullable<MemberQuery['status']>;
  validity: NonNullable<MemberQuery['validity']>;
  source: NonNullable<MemberQuery['source']>;
  expiringSoon: boolean;
  vipReviewDue: boolean;
  formerEmployee: boolean;
};
const NO_FILTERS: Filters = { tier: '', status: '', validity: '', source: '', expiringSoon: false, vipReviewDue: false, formerEmployee: false };

/**
 * The member list (FR-MEM-07): search by name, member ID, phone and email; filter by tier, status, validity,
 * source, expiring soon, VIP review due and former employee; sort and page. The server searches, filters and
 * pages; this screen only asks and shows. A row opens the member page. Phone and email arrive only for a user
 * who may see them (FR-RBAC-27), so the columns appear only when the server sent them.
 */
export const MembersContent: React.FC = () => {
  const { t } = useTranslation('members');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  // The expiring-memberships notification links here with ?expiringSoon=true (FR-TIR-11).
  const [searchParams] = useSearchParams();
  const canManage = useAuthStore((s) => s.user?.permissions?.['members.manage'] !== undefined);
  const tier = useTierLabels(tenantSlug);

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({ ...NO_FILTERS, expiringSoon: searchParams.get('expiringSoon') === 'true' });
  const [sortBy, setSortBy] = useState<NonNullable<MemberQuery['sortBy']>>('name');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<MemberPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const debouncedQuery = useDebounce(query, 300);
  const requestKey = JSON.stringify({ query: debouncedQuery.trim(), ...filters, sortBy });

  // A new search, filter or sort starts again from the first page.
  useEffect(() => {
    setPage(1);
  }, [requestKey]);

  const load = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setFailed(false);
    try {
      setResult(await memberService.search(tenantSlug, { ...JSON.parse(requestKey), page, limit: PAGE_SIZE }));
    } catch (error) {
      console.error('Failed to load members', error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, requestKey, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const filtered = query.trim() !== '' || JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const rows = result?.data ?? [];
  const showPhone = rows.some((r) => r.phone !== undefined);
  const showEmail = rows.some((r) => r.email !== undefined);
  const columns = 5 + Number(showPhone) + Number(showEmail);
  const open = (id: string) => navigate(`/${tenantSlug}/members/${id}`);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('breadcrumb')}</div>
          <h1 className={styles.title}>{t('list.title')}</h1>
          <p className={styles.subtitle}>{t('list.subtitle')}</p>
        </div>
        {canManage && (
          <div className={styles.headerActions}>
            <Button icon={<Plus size={16} />} onClick={() => navigate(`/${tenantSlug}/members/new`)}>
              {t('list.new')}
            </Button>
          </div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.filters}>
          <div className={styles.searchBox}>
            <TextInput
              label={t('list.searchLabel')}
              placeholder={t('list.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              iconLeft={<Search size={16} />}
            />
          </div>
          <SelectInput label={t('list.filters.tier')} value={filters.tier} onChange={(e) => set('tier', e.target.value as Filters['tier'])}>
            <option value="">{t('list.filters.any')}</option>
            {TIERS.map((value) => (
              <option key={value} value={value}>{tier(value).label}</option>
            ))}
          </SelectInput>
          <SelectInput label={t('list.filters.status')} value={filters.status} onChange={(e) => set('status', e.target.value as Filters['status'])}>
            <option value="">{t('list.filters.any')}</option>
            {(['ACTIVE', 'SUSPENDED', 'CLOSED'] as const).map((value) => (
              <option key={value} value={value}>{t(`status.${value}`)}</option>
            ))}
          </SelectInput>
          <SelectInput label={t('list.filters.validity')} value={filters.validity} onChange={(e) => set('validity', e.target.value as Filters['validity'])}>
            <option value="">{t('list.filters.any')}</option>
            <option value="VALID">{t('list.filters.valid')}</option>
            <option value="NOT_VALID">{t('list.filters.notValid')}</option>
          </SelectInput>
          <SelectInput label={t('list.filters.source')} value={filters.source} onChange={(e) => set('source', e.target.value as Filters['source'])}>
            <option value="">{t('list.filters.any')}</option>
            {(['CORPORATE', 'INDIVIDUAL', 'FAMILY'] as const).map((value) => (
              <option key={value} value={value}>{t(`source.${value}`)}</option>
            ))}
          </SelectInput>
          <label className={styles.filterCheck}>
            <input type="checkbox" checked={filters.expiringSoon} onChange={(e) => set('expiringSoon', e.target.checked)} />
            {t('list.filters.expiringSoon')}
          </label>
          <label className={styles.filterCheck}>
            <input type="checkbox" checked={filters.vipReviewDue} onChange={(e) => set('vipReviewDue', e.target.checked)} />
            {t('list.filters.vipReviewDue')}
          </label>
          <label className={styles.filterCheck}>
            <input type="checkbox" checked={filters.formerEmployee} onChange={(e) => set('formerEmployee', e.target.checked)} />
            {t('list.filters.formerEmployee')}
          </label>
          <SelectInput label={t('list.sortBy')} value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            {(['name', 'memberNumber', 'tier', 'createdAt'] as const).map((value) => (
              <option key={value} value={value}>{t(`list.sort.${value}`)}</option>
            ))}
          </SelectInput>
          {filtered && (
            <Button
              variant="ghost"
              onClick={() => {
                setQuery('');
                setFilters(NO_FILTERS);
              }}
            >
              {t('list.filters.clear')}
            </Button>
          )}
        </div>

        {result && <div className={styles.summary} role="status">{t('list.total', { count: result.total })}</div>}

        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('list.columns.number')}</th>
                <th scope="col">{t('list.columns.name')}</th>
                <th scope="col">{t('list.columns.tier')}</th>
                <th scope="col">{t('list.columns.status')}</th>
                <th scope="col">{t('list.columns.source')}</th>
                {showPhone && <th scope="col">{t('list.columns.phone')}</th>}
                {showEmail && <th scope="col">{t('list.columns.email')}</th>}
              </tr>
            </thead>
            <tbody>
              {loading && !result && (
                <tr><td colSpan={columns} className={styles.loadingCell}>…</td></tr>
              )}
              {failed && (
                <tr><td colSpan={columns} className={styles.loadingCell} role="alert">{t('list.loadFailed')}</td></tr>
              )}
              {!failed && result && rows.length === 0 && (
                <tr>
                  <td colSpan={columns}>
                    <div className={styles.emptyState}>
                      <Users size={32} aria-hidden />
                      <p>{filtered ? t('list.emptyFiltered') : t('list.empty')}</p>
                    </div>
                  </td>
                </tr>
              )}
              {!failed &&
                rows.map((member) => {
                  const style = tier(member.tier);
                  return (
                    <tr key={member.id} className={styles.row} onClick={() => open(member.id)}>
                      <td>
                        <a
                          className={styles.memberLink}
                          href={`/${tenantSlug}/members/${member.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            open(member.id);
                          }}
                        >
                          {member.memberNumber}
                        </a>
                      </td>
                      <td>
                        {member.lastName} {member.firstName}
                        {member.employer?.name && <div className={styles.muted}>{member.employer.name}</div>}
                        {member.formerEmployee && <div className={styles.muted}>{t('list.formerEmployee')}</div>}
                      </td>
                      <td><TierBadge tier={member.tier} label={style.label} colour={style.colour} /></td>
                      <td><StatusBadge status={member.status} />{member.expiringSoon && <> <ExpiringBadge /></>}</td>
                      <td>{t(`source.${member.source}`)}</td>
                      {showPhone && <td>{member.phone ?? <span className={styles.muted}>—</span>}</td>}
                      {showEmail && <td>{member.email ?? <span className={styles.muted}>—</span>}</td>}
                    </tr>
                  );
                })}
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
