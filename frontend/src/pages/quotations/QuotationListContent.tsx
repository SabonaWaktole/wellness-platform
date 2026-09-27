import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  ChevronLeft, 
  ChevronRight, 
  Edit,
  FileText
} from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { DropdownMenu } from '../../components/ui/DropdownMenu/DropdownMenu';
import { Badge } from '../../components/ui/Badge/Badge';
import type { BadgeProps } from '../../components/ui/Badge/Badge';
import styles from './QuotationListContent.module.css';

import { useQuotations, usePendingApprovals } from '../../hooks/useQuotations';
import { useDebounce } from '../../hooks/useDebounce';
import { useAuthStore } from '../../store/useAuthStore';
import { usePermission } from '../../hooks/usePermission';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { useDateFormat } from '../../hooks/useDateFormat';

export const QuotationListContent: React.FC = () => {
  const dates = useDateFormat();
  const { t } = useTranslation('quotations');
  const { t: tc } = useTranslation('common');
  const { format: formatMoney } = useMoneyFormat();
  const statusLabel = useStatusLabel();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'DRAFT' | 'PENDING_APPROVAL' | 'SENT' | 'COMPLETED'>('ALL');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // quotations.approve (FR-RBAC-07), not the BUSINESS_OWNER role.
  const isOwner = usePermission('quotations.approve');

  const { fetchQuotations, loading: loadingAll } = useQuotations();
  const { fetchPendingApprovals, loading: loadingPending } = usePendingApprovals();
  
  const [quotations, setQuotations] = useState<any[]>([]);
  const [total, setTotal] = useState(0);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  useEffect(() => {
    const loadData = async () => {
      try {
        if (activeTab === 'PENDING_APPROVAL') {
          const data = await fetchPendingApprovals();
          // Filter locally if there's a search term (simple fallback)
          const filtered = debouncedSearchTerm 
            ? data.filter((q: any) => q.clientName?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) || q.id.includes(debouncedSearchTerm))
            : data;
          setQuotations(filtered);
          setTotal(filtered.length);
        } else {
          const response = await fetchQuotations({ query: debouncedSearchTerm });
          
          let filteredList = response.data || [];
          if (activeTab === 'DRAFT') filteredList = filteredList.filter((q: any) => q.status === 'DRAFT');
          if (activeTab === 'SENT') filteredList = filteredList.filter((q: any) => q.status === 'SENT');
          if (activeTab === 'COMPLETED') filteredList = filteredList.filter((q: any) => ['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(q.status));
          
          setQuotations(filteredList);
          // If we filter locally, total might be off, but for MVP it's acceptable
          setTotal(activeTab === 'ALL' ? response.total : filteredList.length);
        }
      } catch (error) {
        console.error('Failed to load quotations', error);
      }
    };
    loadData();
  }, [fetchQuotations, fetchPendingApprovals, debouncedSearchTerm, activeTab]);

  const getStatusBadgeVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'DRAFT': return 'secondary';
      case 'PENDING_APPROVAL': return 'warning';
      case 'SENT': return 'primary';
      case 'ACCEPTED': return 'success';
      case 'REJECTED': return 'error';
      case 'EXPIRED': return 'secondary';
      default: return 'secondary';
    }
  };


  const isLoading = loadingAll || loadingPending;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('breadcrumb')}</div>
          <h1 className={styles.title}>{t('list.title')}</h1>
        </div>
        <div className={styles.headerActions}>
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => navigate(`/${tenantSlug}/quotations/new`)}>
            {t('list.createQuotation')}
          </Button>
        </div>
      </div>

      {/* Table Card */}
      <div className={styles.tableCard}>
        {/* Toolbar */}
        <div className={styles.tableToolbar}>
          <div className={styles.tabs}>
            <button 
              className={`${styles.tab} ${activeTab === 'ALL' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('ALL')}
            >
              {t('list.tabAll')}
            </button>
            <button 
              className={`${styles.tab} ${activeTab === 'DRAFT' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('DRAFT')}
            >
              {t('list.tabDraft')}
            </button>
            {isOwner && (
              <button 
                className={`${styles.tab} ${activeTab === 'PENDING_APPROVAL' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('PENDING_APPROVAL')}
              >
                {t('list.tabPending')}
              </button>
            )}
            <button 
              className={`${styles.tab} ${activeTab === 'SENT' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('SENT')}
            >
              {t('list.tabSent')}
            </button>
            <button 
              className={`${styles.tab} ${activeTab === 'COMPLETED' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('COMPLETED')}
            >
              {t('list.tabCompleted')}
            </button>
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

        {/* Content */}
        <div className={styles.tableContainer}>
          {!isLoading && quotations.length === 0 ? (
            <div className={styles.emptyState}>
              <FileText className={styles.emptyStateIcon} size={48} />
              <h3 className={styles.emptyStateTitle}>
                {searchTerm ? t('list.emptySearch') : t('list.empty')}
              </h3>
              <p className={styles.emptyStateMessage}>
                {searchTerm
                  ? t('list.emptySearchMessage')
                  : t('list.emptyMessage')}
              </p>
              {!searchTerm && (
                <Button variant="primary" icon={<Plus size={18} />} onClick={() => navigate(`/${tenantSlug}/quotations/new`)}>
                  {t('list.createQuotation')}
                </Button>
              )}
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('list.columnId')}</th>
                  <th>{t('list.columnClient')}</th>
                  <th>{t('list.columnCreated')}</th>
                  <th>{t('list.columnTotal')}</th>
                  <th>{t('list.columnStatus')}</th>
                  <th className={styles.tdAction}></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={6} style={{textAlign:'center', padding:'20px'}}>{tc('state.loading')}</td></tr>}
                {!isLoading && quotations.map((quotation) => {
                  return (
                    <tr key={quotation.id}>
                      <td>
                        <span className={styles.quoteIdLink} onClick={() => navigate(`/${tenantSlug}/quotations/${quotation.id}`)}>
                          {quotation.id.split('-')[0].toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className={styles.clientName}>{quotation.clientName || t('list.unknownClient')}</span>
                      </td>
                      <td>
                        <span className={styles.mutedText}>
                          {dates.date(quotation.createdAt)}
                        </span>
                      </td>
                      <td>
                        <span className={styles.amountText}>
                          {formatMoney(quotation.grandTotal ?? 0)}
                        </span>
                      </td>
                      <td>
                        <Badge variant={getStatusBadgeVariant(quotation.status)}>
                          {statusLabel.quotation(quotation.status)}
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
                            { id: 'view', label: t('list.viewDetails'), icon: <FileText size={16} />, onClick: () => navigate(`/${tenantSlug}/quotations/${quotation.id}`) },
                            { id: 'edit', label: tc('actions.edit'), icon: <Edit size={16} />, onClick: () => navigate(`/${tenantSlug}/quotations/${quotation.id}/edit`) },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Footer */}
        {quotations.length > 0 && (
          <div className={styles.pagination}>
            <span className={styles.paginationText}>
              {t('list.showing', { shown: quotations.length, total })}
            </span>
            <div className={styles.paginationControls}>
              <Button variant="outline" disabled icon={<ChevronLeft size={18} />}>
                Prev
              </Button>
              <Button variant="outline" disabled icon={<ChevronRight size={18} />} iconPosition="right">
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
