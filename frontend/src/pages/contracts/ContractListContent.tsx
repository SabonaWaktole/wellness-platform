import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, MoreVertical, ChevronLeft, ChevronRight, FileSignature, Plus } from 'lucide-react';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { Button } from '../../components/ui/Button/Button';
import { Can } from '../../components/auth/Can';
import { usePermission } from '../../hooks/usePermission';
import { DropdownMenu } from '../../components/ui/DropdownMenu/DropdownMenu';
import { StatusBadge } from '../../components/ui/StatusBadge/StatusBadge';
import styles from './ContractListContent.module.css';

import { useContracts } from '../../hooks/useContracts';
import { useDebounce } from '../../hooks/useDebounce';
import { useTeam } from '../../hooks/useTeam';
import { getStaffDisplayName } from '../../utils/userUtils';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { useDateFormat } from '../../hooks/useDateFormat';
import type { Contract } from '../../types/contract';
import { ValidityBadge } from '../../components/contracts/ValidityBadge';
import { contractReference } from '../../utils/contractReference';

/**
 * EXPIRING is not a contract status — it is a filter over ACTIVE contracts by
 * end date. It sits in the same tab strip because that is how people think
 * about it ("what needs renewing?"), but it has to be translated into
 * `expiringWithinDays` rather than a status on the wire.
 */
type ContractTab =
  | 'ALL'
  | 'DRAFT'
  | 'PENDING_SIGNATURE'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'CANCELLED';

const TABS: ContractTab[] = [
  'ALL',
  'DRAFT',
  'PENDING_SIGNATURE',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRING',
  'EXPIRED',
  'CANCELLED',
];

/** Matches ContractRenewalReminderJob's lead time, so the tab and the notification agree. */
const EXPIRING_WINDOW_DAYS = 30;

/**
 * ALL and EXPIRING aren't contract statuses (see the note above), so they
 * keep fixed translation keys. Every other tab reads its label from
 * `statusLabel.contract`, the same tenant-configurable resolver the status
 * badges use (FR-SET-07 acceptance): renaming a status in Settings →
 * Statuses changes its tab here too.
 */
const FIXED_TAB_LABEL_KEY: Partial<Record<ContractTab, string>> = {
  ALL: 'list.tabAll',
  EXPIRING: 'list.tabExpiring',
};

export const ContractListContent: React.FC = () => {
  const dates = useDateFormat();
  const { t } = useTranslation('contracts');
  const { t: tc } = useTranslation('common');
  const { format: formatMoney } = useMoneyFormat();
  const statusLabel = useStatusLabel();
  // FR-RBAC-06: the API leaves out what this viewer may not see, so the
  // columns for it go too, rather than rendering a row of blanks.
  const seesValue = usePermission('commercial.view');
  const seesPayments = usePermission('payments.view');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<ContractTab>('ALL');
  // FR-CON-08: the validity, salesperson, end-date range and overdue filters.
  const [validity, setValidity] = useState<'' | 'VALID' | 'EXPIRING_SOON' | 'NOT_VALID'>('');
  const [salespersonId, setSalespersonId] = useState('');
  const [endsFrom, setEndsFrom] = useState('');
  const [endsTo, setEndsTo] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const { staff, fetchStaff } = useTeam();
  const { tenantSlug } = useParams();
  const navigate = useNavigate();

  const { fetchContracts, loading } = useContracts();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [total, setTotal] = useState(0);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetchContracts({
          query: debouncedSearchTerm,
          status: activeTab === 'ALL' || activeTab === 'EXPIRING' ? undefined : activeTab,
          expiringWithinDays: activeTab === 'EXPIRING' ? EXPIRING_WINDOW_DAYS : undefined,
          validity: validity || undefined,
          assignedUserId: salespersonId || undefined,
          endsFrom: endsFrom || undefined,
          endsTo: endsTo || undefined,
          hasOverdue: onlyOverdue ? 'true' : undefined,
        });
        setContracts(response.data || []);
        setTotal(response.total ?? (response.data || []).length);
      } catch (error) {
        console.error('Failed to load contracts', error);
      }
    };
    loadData();
  }, [fetchContracts, debouncedSearchTerm, activeTab, validity, salespersonId, endsFrom, endsTo, onlyOverdue]);

  /**
   * The countdown line under the term.
   *
   * Only meaningful for a live contract: "expires in 4 days" under a cancelled
   * one describes a date that stopped mattering when somebody ended it.
   */
  const renderExpiryHint = useCallback(
    (contract: Contract) => {
      // Reception's view has no countdown; its badge says what matters.
      if (contract.status !== 'ACTIVE' || contract.daysUntilExpiry === undefined) return null;

      const days = contract.daysUntilExpiry;
      if (days < 0) {
        return (
          <span className={`${styles.expiryHint} ${styles.expiryPast}`}>
            {t('list.expiredAgo', { days: Math.abs(days) })}
          </span>
        );
      }
      if (days === 0) {
        return (
          <span className={`${styles.expiryHint} ${styles.expirySoon}`}>
            {t('list.expiresToday')}
          </span>
        );
      }
      return (
        <span
          className={`${styles.expiryHint} ${days <= EXPIRING_WINDOW_DAYS ? styles.expirySoon : ''}`}
        >
          {t('list.expiresIn', { days })}
        </span>
      );
    },
    [t]
  );

  const emptyTitle = searchTerm
    ? t('list.emptySearch')
    : activeTab === 'EXPIRING'
      ? t('list.emptyExpiring')
      : t('list.empty');

  const emptyMessage = searchTerm
    ? t('list.emptySearchMessage')
    : activeTab === 'EXPIRING'
      ? t('list.emptyExpiringMessage')
      : t('list.emptyMessage');

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('breadcrumb')}</div>
          <h1 className={styles.title}>{t('list.title')}</h1>
        </div>
        <div className={styles.headerActions}>
          <Can permission="contracts.manage">
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => navigate(`/${tenantSlug}/contracts/new`)}
            >
              {t('list.newContract')}
            </Button>
          </Can>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableToolbar}>
          <div className={styles.tabs}>
            {TABS.map((tab) => (
              <button
                key={tab}
                className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {FIXED_TAB_LABEL_KEY[tab] ? t(FIXED_TAB_LABEL_KEY[tab]!) : statusLabel.contract(tab)}
              </button>
            ))}
          </div>
          <div className={styles.searchWrapper}>
            <TextInput
              placeholder={t('list.searchPlaceholder')}
              iconLeft={<Search size={18} />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.filters}>
          <SelectInput label={t('list.filterValidity')} value={validity} onChange={(e) => setValidity(e.target.value as typeof validity)}>
            <option value="">{t('list.validityAll')}</option>
            <option value="VALID">{t('list.validityValid')}</option>
            <option value="EXPIRING_SOON">{t('list.validityExpiring')}</option>
            <option value="NOT_VALID">{t('list.validityNotValid')}</option>
          </SelectInput>
          <SelectInput label={t('list.filterSalesperson')} value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)}>
            <option value="">{t('list.validityAll')}</option>
            {staff.map((person: any) => (
              <option key={person.id} value={person.id}>
                {getStaffDisplayName(person)}
              </option>
            ))}
          </SelectInput>
          <TextInput label={t('list.filterEndsFrom')} type="date" value={endsFrom} onChange={(e) => setEndsFrom(e.target.value)} />
          <TextInput label={t('list.filterEndsTo')} type="date" value={endsTo} onChange={(e) => setEndsTo(e.target.value)} />
          {seesPayments && (
            <label className={styles.filterCheck}>
              <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
              {t('list.filterOverdue')}
            </label>
          )}
        </div>

        <div className={styles.tableContainer}>
          {!loading && contracts.length === 0 ? (
            <div className={styles.emptyState}>
              <FileSignature className={styles.emptyStateIcon} size={48} />
              <h3 className={styles.emptyStateTitle}>{emptyTitle}</h3>
              <p className={styles.emptyStateMessage}>{emptyMessage}</p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('list.columnId')}</th>
                  <th>{t('list.columnClient')}</th>
                  {seesValue && <th>{t('list.columnPlan')}</th>}
                  <th>{t('list.columnTerm')}</th>
                  <th>{t('list.columnValidity')}</th>
                  {seesValue && <th>{t('list.columnValue')}</th>}
                  {seesPayments && <th>{t('list.columnOwed')}</th>}
                  <th>{t('list.columnStatus')}</th>
                  <th className={styles.tdAction}></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '20px' }}>
                      {tc('state.loading')}
                    </td>
                  </tr>
                )}
                {!loading &&
                  contracts.map((contract) => (
                    <tr key={contract.id}>
                      <td>
                        <span
                          className={styles.quoteIdLink}
                          onClick={() => navigate(`/${tenantSlug}/contracts/${contract.id}`)}
                        >
                          {contract.number ?? contractReference(contract.id)}
                        </span>
                        {contract.legacy && <span className={styles.legacyChip}>{t('list.legacy')}</span>}
                      </td>
                      <td>
                        <span className={styles.clientName}>
                          {contract.clientName || contract.company?.name || t('list.unknownClient')}
                        </span>
                      </td>
                      {seesValue && (
                        <td>
                          <span className={styles.planName}>{contract.planName}</span>
                        </td>
                      )}
                      <td>
                        <div className={styles.termCell}>
                          <span className={styles.mutedText}>
                            {dates.date(contract.startsAt)} – {dates.date(contract.endsAt)}
                          </span>
                          {renderExpiryHint(contract)}
                        </div>
                      </td>
                      <td>{contract.validity ? <ValidityBadge validity={contract.validity} /> : '—'}</td>
                      {seesValue && (
                        <td>
                          <span className={styles.amountText}>
                            {formatMoney(contract.amount)}
                          </span>
                          <span className={styles.expiryHint}>
                            {' '}
                            / {contract.billingPeriod && statusLabel.billingPeriod(contract.billingPeriod)}
                          </span>
                        </td>
                      )}
                      {seesPayments && (
                        <td>
                          <div className={styles.owedCell}>
                            {contract.paymentSummary ? (
                              <>
                                <span
                                  className={
                                    contract.paymentSummary.outstanding > 0
                                      ? styles.amountText
                                      : styles.owedClear
                                  }
                                >
                                  {formatMoney(contract.paymentSummary.outstanding)}
                                </span>
                                {contract.paymentSummary.overdueCount > 0 && (
                                  <span className={styles.overdueChip}>
                                    {t('list.overdueBadge', {
                                      count: contract.paymentSummary.overdueCount,
                                    })}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className={styles.owedClear}>—</span>
                            )}
                          </div>
                        </td>
                      )}
                      <td>
                        <StatusBadge domain="contract" status={contract.status} />
                      </td>
                      <td className={styles.tdAction}>
                        <DropdownMenu
                          trigger={
                            <button className={styles.actionButton}>
                              <MoreVertical size={18} />
                            </button>
                          }
                          items={[
                            {
                              id: 'view',
                              label: t('list.viewDetails'),
                              icon: <FileSignature size={16} />,
                              onClick: () => navigate(`/${tenantSlug}/contracts/${contract.id}`),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        {contracts.length > 0 && (
          <div className={styles.pagination}>
            <span className={styles.paginationText}>
              {t('list.showing', { shown: contracts.length, total })}
            </span>
            <div className={styles.paginationControls}>
              <button className={styles.actionButton} disabled aria-label="Previous">
                <ChevronLeft size={18} />
              </button>
              <button className={styles.actionButton} disabled aria-label="Next">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
