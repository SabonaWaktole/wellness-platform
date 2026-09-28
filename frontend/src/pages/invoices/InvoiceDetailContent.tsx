import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, CheckCircle, Send, ArrowLeft, Ban } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Card } from '../../components/ui/Card/Card';
import { Badge } from '../../components/ui/Badge/Badge';
import type { BadgeProps } from '../../components/ui/Badge/Badge';
import styles from './InvoiceDetailContent.module.css';

import { useInvoices, useInvoiceActions } from '../../hooks/useInvoices';
import { useTeam } from '../../hooks/useTeam';
import { findPersonById, getStaffDisplayName } from '../../utils/userUtils';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { usePermission } from '../../hooks/usePermission';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { useDateFormat } from '../../hooks/useDateFormat';

export const InvoiceDetailContent: React.FC = () => {
  const dates = useDateFormat();
  const { t } = useTranslation('invoices');
  const { format: formatMoney } = useMoneyFormat();
  // FR-RBAC-06: without commercial.view the API sends no prices or totals.
  const seesValue = usePermission('commercial.view');
  const statusLabel = useStatusLabel();
  const navigate = useNavigate();
  const { tenantSlug, id } = useParams();

  const { fetchInvoiceDetail, downloadInvoicePdf, loading } = useInvoices();
  const { staff, fetchStaff } = useTeam();
  const actionHooks = useInvoiceActions();

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const displayUser = (userId: string | null | undefined): string => {
    if (!userId) return t('detail.unknownUser');
    const person = findPersonById(staff, userId);
    return person ? getStaffDisplayName(person) : `${userId.substring(0, 8)}`;
  };

  const [data, setData] = useState<any>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (id) {
      try {
        const detail = await fetchInvoiceDetail(id);
        setData(detail);
      } catch (err) {
        console.error(err);
      }
    }
  }, [id, fetchInvoiceDetail]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading || !data) {
    return <div className={styles.loadingState}>{t('detail.loading')}</div>;
  }

  const { invoice, lineItems, history, permittedActions } = data;
  const reference = invoice.id.split('-')[0].toUpperCase();

  const handleAction = async (action: string) => {
    if (!id) return;
    setActionError(null);
    try {
      if (action === 'SEND') await actionHooks.sendInvoice(id);
      if (action === 'MARK_PAID') await actionHooks.markInvoicePaid(id);
      if (action === 'VOID') await actionHooks.voidInvoice(id);
      await loadData();
    } catch (err: any) {
      setActionError(err.message || 'An error occurred while performing this action.');
    }
  };

  const handleDownload = async () => {
    if (!id) return;
    try {
      await downloadInvoicePdf(id, reference, true);
    } catch (err: any) {
      setActionError(err.message || 'Could not download the PDF.');
    }
  };

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
          <button
            type="button"
            className={styles.breadcrumb}
            onClick={() => navigate(`/${tenantSlug}/invoices`)}
          >
            <ArrowLeft size={14} />
            {t('detail.breadcrumb', { reference })}
          </button>
          <div className={styles.headerTitleRow}>
            <h1 className={styles.title}>{t('detail.title', { reference })}</h1>
            <Badge variant={getStatusBadgeVariant(invoice.status)}>
              {statusLabel.invoice(invoice.status)}
            </Badge>
          </div>
        </div>
        <div className={styles.headerActions}>
          {permittedActions.includes('SEND') && (
            <Button variant="primary" icon={<Send size={16} />} onClick={() => handleAction('SEND')}>{t('detail.send')}</Button>
          )}
          {permittedActions.includes('MARK_PAID') && (
            <Button variant="success" icon={<CheckCircle size={16} />} onClick={() => handleAction('MARK_PAID')}>{t('detail.markPaid')}</Button>
          )}
          {permittedActions.includes('VOID') && (
            <Button variant="danger" icon={<Ban size={16} />} onClick={() => handleAction('VOID')}>{t('detail.void')}</Button>
          )}
          <Button variant="outline" icon={<Download size={16} />} onClick={handleDownload}>
            {t('detail.downloadPdf')}
          </Button>
        </div>
      </div>

      {actionError && (
        <div className={styles.errorBanner} role="alert">
          {actionError}
        </div>
      )}

      <div className={styles.grid}>
        <div className={styles.mainCol}>
          <Card padding="lg">
            <h2 className={styles.sectionTitle}>{t('detail.detailsHeading')}</h2>
            <div className={styles.summaryGrid}>
              <div>
                <div className={styles.summaryLabel}>{t('detail.client')}</div>
                <div className={styles.summaryValue}>{invoice.clientName || t('detail.unknownClient')}</div>
              </div>
              <div>
                <div className={styles.summaryLabel}>{t('detail.dateCreated')}</div>
                <div className={styles.summaryValue}>{dates.date(invoice.createdAt)}</div>
              </div>
              <div>
                <div className={styles.summaryLabel}>{t('detail.dueDate')}</div>
                <div className={styles.summaryValue}>{dates.date(invoice.dueDate)}</div>
              </div>
              <div>
                <div className={styles.summaryLabel}>{t('detail.createdBy')}</div>
                <div className={styles.summaryValue}>{displayUser(invoice.createdByUserId)}</div>
              </div>
            </div>
          </Card>

          <Card padding="none">
            <div className={styles.lineItemsHeader}>
              <h2 className={styles.sectionTitle}>{t('detail.lineItems')}</h2>
            </div>
            <div className="table-scroll">
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('detail.columnProduct')}</th>
                    <th>{t('detail.columnQuantity')}</th>
                    {seesValue && <th>{t('detail.columnUnitPrice')}</th>}
                    {seesValue && <th style={{ textAlign: 'right' }}>{t('detail.columnLineTotal')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item: any, idx: number) => (
                    <tr key={idx}>
                      <td>
                        <div>{item.productName || item.productId}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
                          {t('detail.warehouse', { warehouse: item.warehouseName || item.warehouseId })}
                        </div>
                      </td>
                      <td>{item.quantity}</td>
                      {seesValue && <td>{formatMoney(item.unitPrice)}</td>}
                      {seesValue && (
                        <td style={{ textAlign: 'right', fontWeight: 500 }}>
                          {formatMoney(item.quantity * item.unitPrice)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {seesValue && (
              <div className={styles.totalsSection} style={{ padding: 'var(--spacing-lg)' }}>
                <div className={styles.totalsCard}>
                  <div className={styles.totalRow}>
                    <span>{t('detail.subtotal')}</span>
                    <span>{formatMoney(invoice.grandTotal ?? 0)}</span>
                  </div>
                  <div className={styles.grandTotalRow}>
                    <span>{t('detail.grandTotal')}</span>
                    <span>{formatMoney(invoice.grandTotal ?? 0)}</span>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className={styles.sidebarCol}>
          <Card padding="lg">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t('detail.statusHistory')}</h2>
            </div>
            <div className={styles.timeline}>
              {history.map((event: any, idx: number) => (
                <div key={idx} className={styles.timelineItem}>
                  <div className={styles.timelineDot} />
                  <div className={styles.timelineContent}>
                    <span className={styles.timelineStatus}>{statusLabel.invoice(event.toStatus)}</span>
                    <span className={styles.timelineDate}>{dates.dateTime(event.changedAt)}</span>
                    <span className={styles.timelineUser}>
                      {t('detail.byUser', { user: displayUser(event.changedByUserId) })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
