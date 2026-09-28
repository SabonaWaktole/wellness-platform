import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, MoreVertical, ChevronLeft, ChevronRight, FileSignature, Plus } from 'lucide-react';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { Button } from '../../components/ui/Button/Button';
import { Can } from '../../components/auth/Can';
import { usePermission } from '../../hooks/usePermission';
import { DropdownMenu } from '../../components/ui/DropdownMenu/DropdownMenu';
import { Badge } from '../../components/ui/Badge/Badge';
import type { BadgeProps } from '../../components/ui/Badge/Badge';
import styles from './ContractListContent.module.css';

import { useContracts } from '../../hooks/useContracts';
import { useDebounce } from '../../hooks/useDebounce';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { useDateFormat } from '../../hooks/useDateFormat';
import type { Contract } from '../../types/contract';
import { contractReference } from '../../utils/contractReference';

/**
 * EXPIRING is not a contract status — it is a filter over ACTIVE contracts by
 * end date. It sits in the same tab strip because that is how people think
 * about it ("what needs renewing?"), but it has to be translated into
 * `expiringWithinDays` rather than a status on the wire.
 */
type ContractTab = 'ALL' | 'DRAFT' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'CANCELLED';

const TABS: ContractTab[] = ['ALL', 'DRAFT', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'CANCELLED'];

/** Matches ContractRenewalReminderJob's lead time, so the tab and the notification agree. */
const EXPIRING_WINDOW_DAYS = 30;

const TAB_LABEL_KEY: Record<ContractTab, string> = {
  ALL: 'list.tabAll',
  DRAFT: 'list.tabDraft',
  ACTIVE: 'list.tabActive',
  EXPIRING: 'list.tabExpiring',
  EXPIRED: 'list.tabExpired',
  CANCELLED: 'list.tabCancelled',
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
  const { tenantSlug } = useParams();
  const navigate = useNavigate();

  const { fetchContracts, loading } = useContracts();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [total, setTotal] = useState(0);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetchContracts({
          query: debouncedSearchTerm,
          status: activeTab === 'ALL' || activeTab === 'EXPIRING' ? undefined : activeTab,
          expiringWithinDays: activeTab === 'EXPIRING' ? EXPIRING_WINDOW_DAYS : undefined,
        });
        setContracts(response.data || []);
        setTotal(response.total ?? (response.data || []).length);
      } catch (error) {
        console.error('Failed to load contracts', error);
      }
    };
    loadData();
  }, [fetchContracts, debouncedSearchTerm, activeTab]);

  const getStatusBadgeVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'DRAFT': return 'secondary';
      case 'PENDING_SIGNATURE': return 'warning';
      case 'ACTIVE': return 'success';
      case 'SUSPENDED': return 'error';
      case 'EXPIRED': return 'warning';
      case 'CANCELLED': return 'error';
      default: return 'secondary';
    }
  };

  /**
   * The countdown line under the term.
   *
   * Only meaningful for a live contract: "expires in 4 days" under a cancelled
   * one describes a date that stopped mattering when somebody ended it.
   */
  const renderExpiryHint = useCallback(
    (contract: Contract) => {
      if (contract.status !== 'ACTIVE') return null;

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
                {t(TAB_LABEL_KEY[tab])}
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
                  <th>{t('list.columnPlan')}</th>
                  <th>{t('list.columnTerm')}</th>
                  {seesValue && <th>{t('list.columnValue')}</th>}
                  {seesPayments && <th>{t('list.columnOwed')}</th>}
                  <th>{t('list.columnStatus')}</th>
                  <th className={styles.tdAction}></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '20px' }}>
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
                          {contractReference(contract.id)}
                        </span>
                      </td>
                      <td>
                        <span className={styles.clientName}>
                          {contract.clientName || t('list.unknownClient')}
                        </span>
                      </td>
                      <td>
                        <span className={styles.planName}>{contract.planName}</span>
                      </td>
                      <td>
                        <div className={styles.termCell}>
                          <span className={styles.mutedText}>
                            {dates.date(contract.startsAt)} – {dates.date(contract.endsAt)}
                          </span>
                          {renderExpiryHint(contract)}
                        </div>
                      </td>
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
                        <Badge variant={getStatusBadgeVariant(contract.status)}>
                          {statusLabel.contract(contract.status)}
                        </Badge>
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
