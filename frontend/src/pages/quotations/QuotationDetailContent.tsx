import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, Edit, CheckCircle, XCircle, Send, ArrowLeft, Archive, Receipt } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Card } from '../../components/ui/Card/Card';
import { Badge } from '../../components/ui/Badge/Badge';
import type { BadgeProps } from '../../components/ui/Badge/Badge';
import styles from './QuotationDetailContent.module.css';
import { API_BASE_URL } from '../../api/baseUrl';

import { useQuotations, useQuotationActions } from '../../hooks/useQuotations';
import { useInvoices } from '../../hooks/useInvoices';
import { useTeam } from '../../hooks/useTeam';
import { findPersonById, getStaffDisplayName } from '../../utils/userUtils';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { usePermission } from '../../hooks/usePermission';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { useDateFormat } from '../../hooks/useDateFormat';

export const QuotationDetailContent: React.FC = () => {
  const dates = useDateFormat();
  const { t } = useTranslation('quotations');
  const { t: ti } = useTranslation('invoices');
  const { format: formatMoney } = useMoneyFormat();
  // FR-RBAC-06: without commercial.view the API sends no prices or totals.
  const seesValue = usePermission('commercial.view');
  const statusLabel = useStatusLabel();
  const navigate = useNavigate();
  const { tenantSlug, id } = useParams();

  const { fetchQuotationDetail, loading } = useQuotations();
  const { staff, fetchStaff } = useTeam();
  const actionHooks = useQuotationActions();
  const { convertQuotationToInvoice, loading: converting } = useInvoices();
  const [convertError, setConvertError] = useState<string | null>(null);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  /**
   * Turns a stored userId into a person's name.
   *
   * "Created By" was rendering the bare UUID and the status timeline was
   * rendering its first eight hex characters after the words "By User:", which
   * reads as a page that failed to load rather than as an identifier. TD-021.
   *
   * The staff endpoint returns deactivated members too, so someone who has left
   * still resolves to their name here. The short-id fallback therefore only
   * applies to a genuinely unknown id, and is kept so history never renders
   * blank.
   */
  const displayUser = (userId: string | null | undefined): string => {
    if (!userId) return t('detail.unknownUser');
    const person = findPersonById(staff, userId);
    return person ? getStaffDisplayName(person) : `${userId.substring(0, 8)}`;
  };

  /**
   * A history row's `changedByUserId` is only ever NULL for two reasons: the
   * expiry scheduler, or the client responding through their public
   * quotation link (RespondToPublicQuotationUseCase — the entity has no
   * "system did this" transition of its own). Only ACCEPTED and REJECTED can
   * be produced by a client, so that is what distinguishes the two here.
   */
  const displayHistoryActor = (event: { changedByUserId: string | null; toStatus: string }): string => {
    if (!event.changedByUserId && (event.toStatus === 'ACCEPTED' || event.toStatus === 'REJECTED')) {
      return t('detail.client');
    }
    return displayUser(event.changedByUserId);
  };

  const [data, setData] = useState<any>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /*
   * useCallback is load-bearing, not decoration. `loadData` is used by the
   * effect below and by handleAction; listing it as a dependency without
   * memoising it would give the effect a new function identity every render and
   * refetch forever. Memoised on its own inputs, the effect runs exactly when
   * the quotation being viewed changes.
   */
  const loadData = useCallback(async () => {
    if (id) {
      try {
        const detail = await fetchQuotationDetail(id);
        setData(detail);
      } catch (err) {
        console.error(err);
      }
    }
  }, [id, fetchQuotationDetail]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading || !data) {
    return <div className={styles.loadingState}>{t('detail.loading')}</div>;
  }

  const { quotation, lineItems, history, permittedActions, shareToken, invoiceId } = data;

  /**
   * Reachable only once the quotation is ACCEPTED and no invoice has been
   * created from it yet — `invoiceId` comes from the detail response
   * (GetQuotationDetailUseCase), which is the single source of truth for
   * "has this already been converted" rather than trying to infer it from
   * quotation status alone.
   */
  const canConvertToInvoice = quotation.status === 'ACCEPTED' && !invoiceId;

  const handleConvertToInvoice = async () => {
    if (!id) return;
    setConvertError(null);
    try {
      const result = await convertQuotationToInvoice(id);
      navigate(`/${tenantSlug}/invoices/${result.id}`);
    } catch (err: any) {
      setConvertError(err.response?.data?.error || err.message || ti('convert.error'));
    }
  };

  /**
   * The customer's PDF, built against this app's own API base.
   *
   * Not returned by the server: it knows FRONTEND_URL but has no configured
   * notion of its own public origin, and deriving one from the Host header
   * breaks behind a proxy. The client already knows where its API lives.
   */
  const pdfUrl = shareToken
    ? `${API_BASE_URL}/public/quotations/${shareToken}/pdf`
    : null;

  const handleAction = async (action: string) => {
    if (!id) return;
    setActionError(null);
    try {
      if (action === 'SUBMIT') await actionHooks.submitQuotation(id);
      if (action === 'APPROVE') await actionHooks.approveQuotation(id);
      if (action === 'RETURN_TO_DRAFT') await actionHooks.returnQuotationToDraft(id, t('detail.returnReason'));
      if (action === 'MARK_ACCEPTED') await actionHooks.markQuotationAccepted(id);
      if (action === 'MARK_REJECTED') await actionHooks.markQuotationRejected(id);
      if (action === 'EXPIRE') await actionHooks.expireQuotation(id);
      await loadData();
    } catch (err: any) {
      setActionError(err.message || 'An error occurred while performing this action.');
    }
  };

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


  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <button
            type="button"
            className={styles.breadcrumb}
            onClick={() => navigate(`/${tenantSlug}/quotations`)}
          >
            <ArrowLeft size={14} />
            {t('detail.breadcrumb', { reference: quotation.reference })}
          </button>
          <div className={styles.headerTitleRow}>
            <h1 className={styles.title}>
            {t('detail.title', { reference: quotation.reference })}
          </h1>
            <Badge variant={getStatusBadgeVariant(quotation.status)}>
              {statusLabel.quotation(quotation.status)}
            </Badge>
          </div>
        </div>
        <div className={styles.headerActions}>
          {permittedActions.includes('EDIT') && (
            <Button variant="outline" icon={<Edit size={16} />} onClick={() => navigate(`/${tenantSlug}/quotations/${id}/edit`)}>{t('detail.edit')}</Button>
          )}
          {permittedActions.includes('RETURN_TO_DRAFT') && (
            <Button variant="outline" icon={<ArrowLeft size={16} />} onClick={() => handleAction('RETURN_TO_DRAFT')}>{t('detail.returnToDraft')}</Button>
          )}
          {permittedActions.includes('SUBMIT') && (
            <Button variant="primary" icon={<Send size={16} />} onClick={() => handleAction('SUBMIT')}>{t('detail.submit')}</Button>
          )}
          {permittedActions.includes('APPROVE') && (
            <Button variant="primary" icon={<CheckCircle size={16} />} onClick={() => handleAction('APPROVE')}>{t('detail.approve')}</Button>
          )}
          {permittedActions.includes('MARK_ACCEPTED') && (
            <Button variant="success" icon={<CheckCircle size={16} />} onClick={() => handleAction('MARK_ACCEPTED')}>{t('detail.markAccepted')}</Button>
          )}
          {permittedActions.includes('MARK_REJECTED') && (
            <Button variant="danger" icon={<XCircle size={16} />} onClick={() => handleAction('MARK_REJECTED')}>{t('detail.markRejected')}</Button>
          )}
          {permittedActions.includes('EXPIRE') && (
            <Button variant="outline" icon={<Archive size={16} />} onClick={() => handleAction('EXPIRE')}>{t('detail.expire')}</Button>
          )}

          {canConvertToInvoice && (
            <Button
              variant="primary"
              icon={<Receipt size={16} />}
              onClick={handleConvertToInvoice}
              disabled={converting}
            >
              {ti('convert.action')}
            </Button>
          )}
          {invoiceId && (
            <Button
              variant="outline"
              icon={<Receipt size={16} />}
              onClick={() => navigate(`/${tenantSlug}/invoices/${invoiceId}`)}
            >
              {ti('detail.title', { reference: invoiceId.split('-')[0].toUpperCase() })}
            </Button>
          )}

          {/*
            Only once the quotation has been sent, because that is when the
            server mints the share token — before then there is no
            customer-facing document to render.

            No "copy client link" action here on purpose: the whole point of
            the client's public page is that it is THEIR decision, so staff —
            who may well be the same person who needs the quotation approved
            — must not have a one-click way to open it and Accept/Reject on
            the client's behalf. The link still goes out by email on Send.
            The PDF stays: it opens in a new tab rather than downloading
            through the API client because it is a public URL needing no auth
            header, and letting the browser fetch it directly means the
            customer and the staff member are looking at byte-identical
            output — that part carries no such risk.
          */}
          {pdfUrl && (
            <Button
              variant="outline"
              icon={<Download size={16} />}
              onClick={() => window.open(pdfUrl, '_blank', 'noopener')}
            >
              {t('share.downloadPdf')}
            </Button>
          )}
        </div>
      </div>
      
      {(actionError || convertError) && (
        <div className={styles.errorBanner} role="alert">
          {actionError || convertError}
        </div>
      )}

      <div className={styles.grid}>
        {/* Main Content */}
        <div className={styles.mainCol}>
          <Card padding="lg">
            <h2 className={styles.sectionTitle}>{t('detail.detailsHeading')}</h2>
            <div className={styles.summaryGrid}>
              <div>
                <div className={styles.summaryLabel}>{t('detail.client')}</div>
                <div className={styles.summaryValue}>{quotation.clientName || t('detail.unknownClient')}</div>
              </div>
              <div>
                <div className={styles.summaryLabel}>{t('detail.dateCreated')}</div>
                <div className={styles.summaryValue}>{dates.date(quotation.createdAt)}</div>
              </div>
              <div>
                <div className={styles.summaryLabel}>{t('detail.createdBy')}</div>
                <div className={styles.summaryValue}>{displayUser(quotation.createdByUserId)}</div>
              </div>
            </div>
            {quotation.notes && (
              <div style={{ marginTop: 'var(--spacing-md)' }}>
                <div className={styles.summaryLabel}>{t('detail.notes')}</div>
                <div className={styles.summaryValue}>{quotation.notes}</div>
              </div>
            )}
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
                    <span>{formatMoney(quotation.grandTotal ?? 0)}</span>
                  </div>
                  <div className={styles.grandTotalRow}>
                    <span>{t('detail.grandTotal')}</span>
                    <span>{formatMoney(quotation.grandTotal ?? 0)}</span>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar Content */}
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
                    <span className={styles.timelineStatus}>{statusLabel.quotation(event.toStatus)}</span>
                    <span className={styles.timelineDate}>{dates.dateTime(event.changedAt)}</span>
                    <span className={styles.timelineUser}>
                      {t('detail.byUser', { user: displayHistoryActor(event) })}
                    </span>
                    {event.note && <span style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--color-on-surface-variant)' }}>
                        {t('detail.reason', { reason: event.note })}
                      </span>}
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
