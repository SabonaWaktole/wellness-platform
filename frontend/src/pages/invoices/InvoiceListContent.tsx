import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, MoreVertical, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { DropdownMenu } from '../../components/ui/DropdownMenu/DropdownMenu';
import { Badge } from '../../components/ui/Badge/Badge';
import type { BadgeProps } from '../../components/ui/Badge/Badge';
import styles from './InvoiceListContent.module.css';

import { useInvoices } from '../../hooks/useInvoices';
import { useDebounce } from '../../hooks/useDebounce';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { usePermission } from '../../hooks/usePermission';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { useDateFormat } from '../../hooks/useDateFormat';

type InvoiceTab = 'ALL' | 'DRAFT' | 'SENT' | 'OVERDUE' | 'PAID';

export const InvoiceListContent: React.FC = () => {
  const dates = useDateFormat();
  const { t } = useTranslation('invoices');
  const { t: tc } = useTranslation('common');
  const { format: formatMoney } = useMoneyFormat();
  // FR-RBAC-06: without commercial.view the API sends no totals.
  const seesValue = usePermission('commercial.view');
  const statusLabel = useStatusLabel();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<InvoiceTab>('ALL');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();

  const { fetchInvoices, loading } = useInvoices();

  const [invoices, setInvoices] = useState<any[]>([]);
  const [total, setTotal] = useState(0);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetchInvoices({
          query: debouncedSearchTerm,
          status: activeTab === 'ALL' ? undefined : activeTab
        });
        setInvoices(response.data || []);
        setTotal(response.total ?? (response.data || []).length);
      } catch (error) {
        console.error('Failed to load invoices', error);
      }
    };
    loadData();
  }, [fetchInvoices, debouncedSearchTerm, activeTab]);

  const getStatusBadgeVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'DRAFT': return 'secondary';
      case 'SENT': return 'primary';
      case 'PAID': return 'success';
      case 'OVERDUE': return 'error';
      case 'VOID': return 'secondary';
      default: return 'secondary';
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('breadcrumb')}</div>
          <h1 className={styles.title}>{t('list.title')}</h1>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableToolbar}>
          <div className={styles.tabs}>
            {(['ALL', 'DRAFT', 'SENT', 'OVERDUE', 'PAID'] as InvoiceTab[]).map((tab) => (
              <button
                key={tab}
                className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'ALL' ? t('list.tabAll') : t(`list.tab${tab.charAt(0)}${tab.slice(1).toLowerCase()}`)}
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
          {!loading && invoices.length === 0 ? (
            <div className={styles.emptyState}>
              <FileText className={styles.emptyStateIcon} size={48} />
              <h3 className={styles.emptyStateTitle}>
                {searchTerm ? t('list.emptySearch') : t('list.empty')}
              </h3>
              <p className={styles.emptyStateMessage}>
                {searchTerm ? t('list.emptySearchMessage') : t('list.emptyMessage')}
              </p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('list.columnId')}</th>
                  <th>{t('list.columnClient')}</th>
                  <th>{t('list.columnCreated')}</th>
                  <th>{t('list.columnDue')}</th>
                  {seesValue && <th>{t('list.columnTotal')}</th>}
                  <th>{t('list.columnStatus')}</th>
                  <th className={styles.tdAction}></th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={seesValue ? 7 : 6} style={{ textAlign: 'center', padding: '20px' }}>{tc('state.loading')}</td></tr>}
                {!loading && invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <span className={styles.quoteIdLink} onClick={() => navigate(`/${tenantSlug}/invoices/${invoice.id}`)}>
                        {invoice.id.split('-')[0].toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className={styles.clientName}>{invoice.clientName || t('list.unknownClient')}</span>
                    </td>
                    <td>
                      <span className={styles.mutedText}>{dates.date(invoice.createdAt)}</span>
                    </td>
                    <td>
                      <span className={styles.mutedText}>{dates.date(invoice.dueDate)}</span>
                    </td>
                    {seesValue && (
                      <td>
                        <span className={styles.amountText}>{formatMoney(invoice.grandTotal ?? 0)}</span>
                      </td>
                    )}
                    <td>
                      <Badge variant={getStatusBadgeVariant(invoice.status)}>
                        {statusLabel.invoice(invoice.status)}
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
                          { id: 'view', label: t('list.viewDetails'), icon: <FileText size={16} />, onClick: () => navigate(`/${tenantSlug}/invoices/${invoice.id}`) },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {invoices.length > 0 && (
          <div className={styles.pagination}>
            <span className={styles.paginationText}>
              {t('list.showing', { shown: invoices.length, total })}
            </span>
            <div className={styles.paginationControls}>
              <button className={styles.actionButton} disabled aria-label="Previous"><ChevronLeft size={18} /></button>
              <button className={styles.actionButton} disabled aria-label="Next"><ChevronRight size={18} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
