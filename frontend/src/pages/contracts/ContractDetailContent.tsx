import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  Download,
  FileSignature,
  FileText,
  Lock,
  Paperclip,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { Card } from '../../components/ui/Card/Card';
import { Badge } from '../../components/ui/Badge/Badge';
import { RichTextReadOnly } from '../../components/forms/registry/RichTextReadOnly';
import type { RichTextDoc } from '../../types/form';
import { StatusBadge } from '../../components/ui/StatusBadge/StatusBadge';
import { Button } from '../../components/ui/Button/Button';
import { Can } from '../../components/auth/Can';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { useContracts, useContractActions } from '../../hooks/useContracts';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useTeam } from '../../hooks/useTeam';
import { findPersonById, getStaffDisplayName } from '../../utils/userUtils';
import { contractReference } from '../../utils/contractReference';
import type { ContractDetail, ContractPayment } from '../../types/contract';
import styles from './ContractDetailContent.module.css';

/** `YYYY-MM-DD` for a date input, which is the only format it accepts. */
const toDateInput = (value: string | null | undefined): string =>
  value ? new Date(value).toISOString().slice(0, 10) : '';

/** Draft state for the add/edit payment modal. */
interface PaymentDraft {
  dueDate: string;
  amount: string;
  method: string;
  note: string;
}

const emptyDraft: PaymentDraft = { dueDate: '', amount: '', method: '', note: '' };

export const ContractDetailContent: React.FC = () => {
  const { t, i18n } = useTranslation('contracts');
  const { t: tc } = useTranslation('common');
  const dates = useDateFormat();
  const { format: formatMoney } = useMoneyFormat();
  const statusLabel = useStatusLabel();
  const { contractId, tenantSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { fetchContractDetail, loading } = useContracts();
  const actions = useContractActions();
  const { staff, fetchStaff } = useTeam();

  const [detail, setDetail] = useState<ContractDetail | null>(null);

  /*
   * Set by the edit form's redirect, not by this page's own fetch: only the
   * response to that update knows whether the new price left already-scheduled
   * instalments showing the old one. Read from route state so a refresh clears
   * it — the warning is about an action just taken, not a property of the row.
   */
  const scheduleWarning = Boolean(
    (location.state as { scheduleNeedsReview?: boolean } | null)?.scheduleNeedsReview
  );

  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'ACTIVATE' | 'MARK_PENDING_SIGNATURE'>(null);
  /** The status change that is waiting for its reason (FR-CON-14, 15): suspend, reinstate or cancel. */
  const [reasonFor, setReasonFor] = useState<null | 'SUSPENDED' | 'ACTIVE' | 'CANCELLED'>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ContractPayment | null>(null);

  const [recordFor, setRecordFor] = useState<ContractPayment | null>(null);
  const [recordAmount, setRecordAmount] = useState('');
  const [recordDate, setRecordDate] = useState('');
  const [recordMethod, setRecordMethod] = useState('');
  const [recordNote, setRecordNote] = useState('');

  const [editingPayment, setEditingPayment] = useState<ContractPayment | null>(null);
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [draft, setDraft] = useState<PaymentDraft>(emptyDraft);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    if (!contractId) return;
    try {
      setDetail(await fetchContractDetail(contractId));
    } catch (error) {
      console.error('Failed to load contract', error);
    }
  }, [contractId, fetchContractDetail]);

  useEffect(() => {
    reload();
    fetchStaff();
  }, [reload, fetchStaff]);

  const contract = detail?.contract;
  const payments = detail?.payments ?? [];
  const can = useCallback(
    (action: string) => detail?.permittedActions.includes(action) ?? false,
    [detail]
  );

  const summary = contract?.paymentSummary;
  /** The signed document is a commercial record: without `commercial.view` the server sends no `documents` (FR-CON-19). */
  const documents = detail?.documents ?? [];
  const documentsShown = detail?.documents !== undefined;

  const ownerName = useMemo(() => {
    if (!contract?.assignedUserId) return t('detail.unassigned');
    const person = findPersonById(staff, contract.assignedUserId);
    return person ? getStaffDisplayName(person) : t('detail.unknownUser');
  }, [contract?.assignedUserId, staff, t]);

  const creatorName = useMemo(() => {
    if (!contract) return '';
    const person = findPersonById(staff, contract.createdByUserId);
    return person ? getStaffDisplayName(person) : t('detail.unknownUser');
  }, [contract, staff, t]);

  /**
   * Every status change is one call; the server decides whether it is allowed and
   * says why not (FR-CON-11), and that message is shown as it is.
   */
  const submitStatus = async (status: string, why?: string) => {
    if (!contractId) return;
    setActionError(null);
    try {
      await actions.changeStatus(contractId, status, why);
      setConfirm(null);
      setReasonFor(null);
      setReason('');
      await reload();
    } catch (error: any) {
      setConfirm(null);
      setReasonFor(null);
      setActionError(error?.response?.data?.error ?? tc('state.error'));
    }
  };

  const openReason = (status: 'SUSPENDED' | 'ACTIVE' | 'CANCELLED') => {
    setReason('');
    setReasonFor(status);
  };

  /** FR-CON-04: re-reads the agreed values from the deal while the contract is a Draft. */
  const handleRefresh = async () => {
    if (!contractId) return;
    setRefreshError(null);
    try {
      await actions.refreshFromDeal(contractId);
      await reload();
    } catch (error: any) {
      setRefreshError(error?.response?.data?.error ?? tc('state.error'));
    }
  };

  const handleRenew = async () => {
    if (!contractId) return;
    const renewal = await actions.renewContract(contractId);
    // Land on the new term rather than the old one — the renewal is what the
    // user now has to fill in and activate.
    navigate(`/${tenantSlug}/contracts/${renewal.id}`);
  };

  const openRecord = (payment: ContractPayment) => {
    setRecordFor(payment);
    setRecordAmount('');
    setRecordDate(new Date().toISOString().slice(0, 10));
    setRecordMethod(payment.method ?? '');
    setRecordNote('');
  };

  const submitRecord = async () => {
    if (!contractId || !recordFor) return;
    await actions.recordPayment(contractId, recordFor.id, {
      action: 'PAY',
      // Blank means "in full" — the backend settles the outstanding balance,
      // so nothing is sent rather than a guessed figure.
      amount: recordAmount ? Number(recordAmount) : undefined,
      paidAt: recordDate || undefined,
      method: recordMethod || null,
      note: recordNote || null,
    });
    setRecordFor(null);
    await reload();
  };

  const quickAction = async (payment: ContractPayment, action: 'UNPAY' | 'WAIVE') => {
    if (!contractId) return;
    await actions.recordPayment(contractId, payment.id, { action });
    await reload();
  };

  const openAddPayment = () => {
    setDraft({ ...emptyDraft, dueDate: new Date().toISOString().slice(0, 10) });
    setIsAddingPayment(true);
  };

  const openEditPayment = (payment: ContractPayment) => {
    setDraft({
      dueDate: toDateInput(payment.dueDate),
      amount: String(payment.amount),
      method: payment.method ?? '',
      note: payment.note ?? '',
    });
    setEditingPayment(payment);
  };

  const submitDraft = async () => {
    if (!contractId) return;
    const payload = {
      dueDate: draft.dueDate,
      amount: Number(draft.amount),
      method: draft.method || null,
      note: draft.note || null,
    };

    if (editingPayment) await actions.updatePayment(contractId, editingPayment.id, payload);
    else await actions.addPayment(contractId, payload);

    setEditingPayment(null);
    setIsAddingPayment(false);
    await reload();
  };

  const confirmDeletePayment = async () => {
    if (!contractId || !pendingDelete) return;
    await actions.deletePayment(contractId, pendingDelete.id);
    setPendingDelete(null);
    await reload();
  };

  const handleFilePicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset immediately so picking the SAME file again still fires a change
    // event — otherwise a failed upload cannot be retried without choosing a
    // different file.
    event.target.value = '';
    if (!file || !contractId) return;
    setActionError(null);
    try {
      await actions.uploadDocument(contractId, file);
      await reload();
    } catch (error: any) {
      setActionError(error?.response?.data?.error ?? tc('state.error'));
    }
  };

  /** The file comes through the API, which checks the permission (FR-CON-19); it is saved from a blob. */
  const downloadDocument = async (documentId: string, fileName: string) => {
    if (!contractId) return;
    setActionError(null);
    try {
      const blob = await actions.downloadDocument(contractId, documentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setActionError(tc('state.error'));
    }
  };

  if (loading && !detail) {
    return <div className={styles.container}>{t('detail.loading')}</div>;
  }

  if (!contract) {
    return <div className={styles.container}>{t('detail.loading')}</div>;
  }

  // The number (FR-CON-05); a Legacy contract keeps its old reference.
  const reference = contract.number ?? contractReference(contract.id);
  const language = i18n.language?.startsWith('en') ? 'en' : 'sq';
  const terms = (language === 'en' ? contract.termsText?.en ?? contract.termsText?.sq : contract.termsText?.sq ?? contract.termsText?.en) as
    | RichTextDoc
    | null
    | undefined;
  const localised = (sq: string, en: string | null) => (language === 'en' && en ? en : sq);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('detail.breadcrumb', { reference })}</div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{t('detail.title', { reference })}</h1>
            <StatusBadge domain="contract" status={contract.status} />
            {contract.legacy && <Badge variant="outline">{t('detail.legacy')}</Badge>}
          </div>
        </div>

        <div className={styles.actions}>
          {can('EDIT') && (
            <Button
              variant="outline"
              icon={<Pencil size={16} />}
              onClick={() => navigate(`/${tenantSlug}/contracts/${contract.id}/edit`)}
            >
              {t('detail.edit')}
            </Button>
          )}
          {can('REFRESH_FROM_DEAL') && (
            <Button variant="outline" icon={<RefreshCw size={16} />} onClick={handleRefresh}>
              {t('detail.refreshFromDeal')}
            </Button>
          )}
          {can('MARK_PENDING_SIGNATURE') && (
            <Button variant="outline" icon={<FileSignature size={16} />} onClick={() => setConfirm('MARK_PENDING_SIGNATURE')}>
              {t('detail.markPendingSignature')}
            </Button>
          )}
          {can('ATTACH_DOCUMENT') && documentsShown && (
            <Button variant="outline" icon={<Paperclip size={16} />} onClick={() => fileInputRef.current?.click()}>
              {documents.length > 0 ? t('detail.replaceDocument') : t('detail.uploadDocument')}
            </Button>
          )}
          {can('ACTIVATE') && (
            <Button variant="primary" icon={<Check size={16} />} onClick={() => setConfirm('ACTIVATE')}>
              {t('detail.activate')}
            </Button>
          )}
          {can('REINSTATE') && (
            <Button variant="primary" icon={<Play size={16} />} onClick={() => openReason('ACTIVE')}>
              {t('detail.reinstate')}
            </Button>
          )}
          {can('SUSPEND') && (
            <Button variant="outline" icon={<Pause size={16} />} onClick={() => openReason('SUSPENDED')}>
              {t('detail.suspend')}
            </Button>
          )}
          {can('RENEW') && (
            <Button variant="primary" icon={<RotateCcw size={16} />} onClick={handleRenew}>
              {t('detail.renew')}
            </Button>
          )}
          {can('CANCEL') && (
            <Button variant="outline" icon={<X size={16} />} onClick={() => openReason('CANCELLED')}>
              {t('detail.cancel')}
            </Button>
          )}
        </div>
      </div>

      {refreshError && (
        <div className={styles.warningBanner}>
          <AlertTriangle size={18} />
          <span>{refreshError}</span>
        </div>
      )}

      {actionError && (
        <div className={styles.warningBanner} role="alert">
          <AlertTriangle size={18} />
          <span>{actionError}</span>
        </div>
      )}

      {scheduleWarning && (
        <div className={styles.warningBanner}>
          <AlertTriangle size={18} />
          <span>{t('detail.scheduleReviewWarning')}</span>
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.column}>
          <Card padding="lg">
            <h2 className={styles.cardTitle}>{t('detail.termsHeading')}</h2>
            <dl className={styles.terms}>
              <div className={styles.termRow}>
                <dt className={styles.termLabel}>{t('detail.client')}</dt>
                <dd className={styles.termValue}>
                  <button
                    type="button"
                    className={styles.linkValue}
                    onClick={() => navigate(`/${tenantSlug}/clients/${contract.clientId}`)}
                  >
                    {contract.clientName}
                  </button>
                </dd>
              </div>
              <div className={styles.termRow}>
                <dt className={styles.termLabel}>{t('detail.plan')}</dt>
                <dd className={styles.termValue}>{contract.planName}</dd>
              </div>
              {/* The deal and offer it came from, the package and its services (FR-CON-06). Absent without commercial.view. */}
              {contract.dealId && (
                <div className={styles.termRow}>
                  <dt className={styles.termLabel}>{t('detail.deal')}</dt>
                  <dd className={styles.termValue}>
                    <button type="button" className={styles.linkValue} onClick={() => navigate(`/${tenantSlug}/deals/${contract.dealId}`)}>
                      {contract.dealTitle ?? t('detail.openDeal')}
                    </button>
                  </dd>
                </div>
              )}
              {contract.quotationReference && (
                <div className={styles.termRow}>
                  <dt className={styles.termLabel}>{t('detail.offer')}</dt>
                  <dd className={styles.termValue}>{contract.quotationReference}</dd>
                </div>
              )}
              {contract.packageName && (
                <div className={styles.termRow}>
                  <dt className={styles.termLabel}>{t('detail.package')}</dt>
                  <dd className={styles.termValue}>{contract.packageName}</dd>
                </div>
              )}
              {contract.servicesSnapshot && contract.servicesSnapshot.length > 0 && (
                <div className={styles.termRow}>
                  <dt className={styles.termLabel}>{t('detail.services')}</dt>
                  <dd className={styles.termValue}>
                    <ul className={styles.serviceList}>
                      {contract.servicesSnapshot.map((service, index) => (
                        <li key={index}>{localised(service.nameSq, service.nameEn)}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
              {/* Absent without commercial.view (FR-RBAC-06). */}
              {contract.billingPeriod && (
                <div className={styles.termRow}>
                  <dt className={styles.termLabel}>{t('detail.billingPeriod')}</dt>
                  <dd className={styles.termValue}>
                    {statusLabel.billingPeriod(contract.billingPeriod)}
                  </dd>
                </div>
              )}
              {contract.amount !== undefined && (
                <div className={styles.termRow}>
                  <dt className={styles.termLabel}>{t('detail.amount')}</dt>
                  <dd className={styles.termValue}>{formatMoney(contract.amount)}</dd>
                </div>
              )}
              {contract.agreedAnnualValue && (
                <div className={styles.termRow}>
                  <dt className={styles.termLabel}>{t('detail.annualValue')}</dt>
                  <dd className={styles.termValue}>{formatMoney(contract.agreedAnnualValue)}</dd>
                </div>
              )}
              {contract.discountPercent && (
                <div className={styles.termRow}>
                  <dt className={styles.termLabel}>{t('detail.discount')}</dt>
                  <dd className={styles.termValue}>{t('detail.discountValue', { percent: contract.discountPercent })}</dd>
                </div>
              )}
              <div className={styles.termRow}>
                <dt className={styles.termLabel}>{t('detail.startsAt')}</dt>
                <dd className={styles.termValue}>{dates.dateMedium(contract.startsAt)}</dd>
              </div>
              <div className={styles.termRow}>
                <dt className={styles.termLabel}>{t('detail.endsAt')}</dt>
                <dd className={styles.termValue}>{dates.dateMedium(contract.endsAt)}</dd>
              </div>
              {contract.renewalDate && (
                <div className={styles.termRow}>
                  <dt className={styles.termLabel}>{t('detail.renewalDate')}</dt>
                  <dd className={styles.termValue}>{dates.dateMedium(contract.renewalDate)}</dd>
                </div>
              )}
              <div className={styles.termRow}>
                <dt className={styles.termLabel}>{t('detail.owner')}</dt>
                <dd className={styles.termValue}>{ownerName}</dd>
              </div>
              <div className={styles.termRow}>
                <dt className={styles.termLabel}>{t('detail.createdBy')}</dt>
                <dd className={styles.termValue}>{creatorName}</dd>
              </div>
              {contract.renewedFromContractId && (
                <div className={styles.termRow}>
                  <dt className={styles.termLabel}>{t('detail.plan')}</dt>
                  <dd className={styles.termValue}>
                    <button
                      type="button"
                      className={styles.linkValue}
                      onClick={() =>
                        navigate(`/${tenantSlug}/contracts/${contract.renewedFromContractId}`)
                      }
                    >
                      {t('detail.renewedFrom', {
                        reference: contractReference(contract.renewedFromContractId),
                      })}
                    </button>
                  </dd>
                </div>
              )}
              {contract.suspensionReason && contract.status === 'SUSPENDED' && (
                <div className={styles.termRow}>
                  <dt className={styles.termLabel}>{t('detail.suspensionReason')}</dt>
                  <dd className={styles.termValue}>{contract.suspensionReason}</dd>
                </div>
              )}
              {contract.cancelReason && (
                <div className={styles.termRow}>
                  <dt className={styles.termLabel}>{t('detail.cancelReason')}</dt>
                  <dd className={styles.termValue}>{contract.cancelReason}</dd>
                </div>
              )}
            </dl>
            {contract.lockedAt && !contract.legacy && (
              <p className={styles.notesEmpty}>
                <Lock size={14} /> {t('detail.lockedHint')}
              </p>
            )}
          </Card>

          {terms?.content && terms.content.length > 0 && (
            <Card padding="lg">
              <h2 className={styles.cardTitle}>{t('detail.terms')}</h2>
              <div className={styles.termsBody}>
                <RichTextReadOnly content={terms} />
              </div>
            </Card>
          )}

          {/* The signed document and its previous versions. Absent without commercial.view (FR-CON-19). */}
          {documentsShown && (
            <Card padding="lg">
              <h2 className={styles.cardTitle}>{t('detail.document')}</h2>
              {documents.length === 0 ? (
                <div className={styles.documentRow}>
                  <p className={styles.notesEmpty}>{t('detail.noDocument')}</p>
                  {can('ATTACH_DOCUMENT') && (
                    <Button variant="outline" icon={<Paperclip size={16} />} onClick={() => fileInputRef.current?.click()}>
                      {t('detail.uploadDocument')}
                    </Button>
                  )}
                </div>
              ) : (
                <ul className={styles.documentList}>
                  {documents.map((version) => {
                    const uploader = findPersonById(staff, version.uploadedByUserId);
                    return (
                      <li key={version.id} className={styles.documentRow}>
                        <button
                          type="button"
                          className={styles.documentLink}
                          onClick={() => downloadDocument(version.id, version.fileName)}
                        >
                          {version.isCurrent ? <FileText size={16} /> : <Download size={16} />}
                          {version.fileName}
                        </button>
                        <span className={styles.notesEmpty}>
                          {version.isCurrent ? t('detail.documentCurrent') : t('detail.documentPrevious')} · {dates.dateTime(version.uploadedAt)} ·{' '}
                          {uploader ? getStaffDisplayName(uploader) : t('detail.unknownUser')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className={styles.notesEmpty}>{t('detail.documentHint')}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className={styles.hiddenFileInput}
                onChange={handleFilePicked}
              />
            </Card>
          )}

          <Card padding="lg">
            <h2 className={styles.cardTitle}>{t('detail.notes')}</h2>
            {contract.notes?.trim() ? (
              <p className={styles.notesBody}>{contract.notes}</p>
            ) : (
              <p className={styles.notesEmpty}>{t('detail.noNotes')}</p>
            )}
          </Card>
        </div>

        <div className={styles.column}>
          {/* The whole card needs payments.view; ADD_PAYMENT needs contracts.manage on top (FR-RBAC-06). */}
          {detail?.payments !== undefined && (
          <Card padding="lg">
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>{t('payments.heading')}</h2>
              {can('ADD_PAYMENT') && (
                <Button variant="outline" icon={<Plus size={16} />} onClick={openAddPayment}>
                  {t('payments.addPayment')}
                </Button>
              )}
            </div>

            {summary && (
              <div className={styles.summaryGrid}>
                <div className={styles.summaryTile}>
                  <span className={styles.summaryLabel}>{t('payments.summaryTotal')}</span>
                  <span className={styles.summaryValue}>{formatMoney(summary.total)}</span>
                </div>
                <div className={styles.summaryTile}>
                  <span className={styles.summaryLabel}>{t('payments.summaryPaid')}</span>
                  <span className={styles.summaryValue}>{formatMoney(summary.paid)}</span>
                </div>
                <div className={styles.summaryTile}>
                  <span className={styles.summaryLabel}>{t('payments.summaryOutstanding')}</span>
                  <span
                    className={`${styles.summaryValue} ${
                      summary.outstanding > 0 ? styles.summaryValueOwed : ''
                    }`}
                  >
                    {formatMoney(summary.outstanding)}
                  </span>
                </div>
              </div>
            )}

            {payments.length === 0 ? (
              <div className={styles.emptyMessage}>
                {contract.status === 'DRAFT' ? t('payments.notActivated') : t('payments.empty')}
              </div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t('payments.columnPeriod')}</th>
                      <th>{t('payments.columnDue')}</th>
                      <th>{t('payments.columnAmount')}</th>
                      <th>{t('payments.columnStatus')}</th>
                      <th>{t('payments.columnPaidOn')}</th>
                      <th>{t('payments.columnMethod')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => {
                      const overdue =
                        payment.outstanding > 0 && new Date(payment.dueDate) < new Date();

                      return (
                        <tr key={payment.id} className={overdue ? styles.rowOverdue : ''}>
                          <td className={styles.muted}>{payment.periodIndex}</td>
                          <td>
                            {dates.date(payment.dueDate)}
                            {overdue && (
                              <span className={styles.partialHint}>{t('payments.overdue')}</span>
                            )}
                          </td>
                          <td className={styles.amountCell}>
                            {formatMoney(payment.amount)}
                            {payment.status === 'PARTIALLY_PAID' && (
                              <span className={styles.partialHint}>
                                {t('payments.outstandingOf', {
                                  outstanding: formatMoney(payment.outstanding),
                                  amount: formatMoney(payment.amount),
                                })}
                              </span>
                            )}
                          </td>
                          <td>
                            <StatusBadge domain="payment" status={payment.status} />
                          </td>
                          <td className={styles.muted}>
                            {payment.paidAt ? dates.date(payment.paidAt) : '—'}
                          </td>
                          <td className={styles.muted}>{payment.method || '—'}</td>
                          <td>
                            <div className={styles.rowActions}>
                              {can('RECORD_PAYMENT') && payment.outstanding > 0 && (
                                <Button
                                  variant="outline"
                                  onClick={() => openRecord(payment)}
                                  title={t('payments.markPaid')}
                                  aria-label={t('payments.markPaid')}
                                >
                                  <Check size={14} />
                                </Button>
                              )}
                              {can('RECORD_PAYMENT') && payment.status !== 'PAYMENT_PENDING' && (
                                <Button
                                  variant="outline"
                                  onClick={() => quickAction(payment, 'UNPAY')}
                                  title={t('payments.markUnpaid')}
                                  aria-label={t('payments.markUnpaid')}
                                >
                                  <Undo2 size={14} />
                                </Button>
                              )}
                              {can('ADD_PAYMENT') && (
                                <>
                                  <Button
                                    variant="outline"
                                    onClick={() => openEditPayment(payment)}
                                    title={t('payments.edit')}
                                    aria-label={t('payments.edit')}
                                  >
                                    <Pencil size={14} />
                                  </Button>
                                  {payment.paidAmount === 0 && (
                                    <Button
                                      variant="outline"
                                      onClick={() => setPendingDelete(payment)}
                                      title={t('payments.delete')}
                                      aria-label={t('payments.delete')}
                                    >
                                      <Trash2 size={14} />
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          )}

          {/* The status history is a manager's record (FR-RBAC-06). */}
          <Can permission="contracts.manage">
          <Card padding="lg">
            <h2 className={styles.cardTitle}>{t('detail.history')}</h2>
            <div className={styles.historyList}>
              {detail?.history.map((entry) => {
                const actor = entry.changedByUserId
                  ? findPersonById(staff, entry.changedByUserId)
                  : null;

                return (
                  <div key={entry.id} className={styles.historyItem}>
                    <span className={styles.historyTransition}>
                      {entry.fromStatus === entry.toStatus
                        ? statusLabel.contract(entry.toStatus)
                        : `${statusLabel.contract(entry.fromStatus)} → ${statusLabel.contract(
                            entry.toStatus
                          )}`}
                    </span>
                    <span className={styles.historyMeta}>
                      {dates.dateTime(entry.changedAt)} ·{' '}
                      {/* A null actor is the scheduler, not an unknown person. */}
                      {entry.changedByUserId
                        ? t('detail.byUser', {
                            user: actor ? getStaffDisplayName(actor) : t('detail.unknownUser'),
                          })
                        : t('detail.bySystem')}
                    </span>
                    {entry.note && <span className={styles.historyNote}>{entry.note}</span>}
                  </div>
                );
              })}
            </div>
          </Card>
          </Can>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirm === 'MARK_PENDING_SIGNATURE'}
        onClose={() => setConfirm(null)}
        onConfirm={() => submitStatus('PENDING_SIGNATURE')}
        title={t('detail.markPendingSignature')}
        message={t('detail.confirmPendingSignature')}
        tone="primary"
      />

      <ConfirmDialog
        isOpen={confirm === 'ACTIVATE'}
        onClose={() => setConfirm(null)}
        onConfirm={() => submitStatus('ACTIVE')}
        title={t('detail.activate')}
        message={t('detail.confirmActivate')}
        tone="primary"
      />

      {/* Suspending, reinstating and cancelling each need a reason, which goes on the history (FR-CON-14, 15, 18). */}
      <Modal
        isOpen={reasonFor !== null}
        onClose={() => setReasonFor(null)}
        title={reasonFor === 'SUSPENDED' ? t('detail.suspend') : reasonFor === 'ACTIVE' ? t('detail.reinstate') : t('detail.cancel')}
      >
        <p>
          {reasonFor === 'SUSPENDED'
            ? t('detail.confirmSuspend')
            : reasonFor === 'ACTIVE'
              ? t('detail.confirmReinstate')
              : t('detail.confirmCancel')}
        </p>
        <TextareaInput
          label={t('detail.reasonLabel')}
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className={styles.modalActions}>
          <Button variant="outline" onClick={() => setReasonFor(null)}>
            {tc('action.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => reasonFor && submitStatus(reasonFor, reason.trim())}
            disabled={actions.loading || reason.trim() === ''}
          >
            {t('detail.confirmReason')}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDeletePayment}
        title={t('payments.delete')}
        message={t('payments.confirmDelete')}
      />

      <Modal
        isOpen={recordFor !== null}
        onClose={() => setRecordFor(null)}
        title={t('payments.recordTitle')}
      >
        <div className={styles.formGrid}>
          <TextInput
            label={t('payments.recordAmount')}
            helperText={t('payments.recordAmountHint')}
            type="number"
            step="0.01"
            min="0"
            value={recordAmount}
            placeholder={recordFor ? String(recordFor.outstanding) : ''}
            onChange={(e) => setRecordAmount(e.target.value)}
          />
          <TextInput
            label={t('payments.recordDate')}
            type="date"
            value={recordDate}
            onChange={(e) => setRecordDate(e.target.value)}
          />
          <TextInput
            label={t('payments.recordMethod')}
            placeholder={t('payments.recordMethodPlaceholder')}
            value={recordMethod}
            onChange={(e) => setRecordMethod(e.target.value)}
          />
          <TextInput
            label={t('payments.recordNote')}
            value={recordNote}
            onChange={(e) => setRecordNote(e.target.value)}
          />
        </div>
        <div className={styles.modalActions}>
          <Button variant="outline" onClick={() => setRecordFor(null)}>
            {tc('action.cancel')}
          </Button>
          <Button variant="outline" onClick={() => recordFor && quickAction(recordFor, 'WAIVE').then(() => setRecordFor(null))}>
            {t('payments.waive')}
          </Button>
          <Button variant="primary" onClick={submitRecord} disabled={actions.loading}>
            {t('payments.markPaid')}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={isAddingPayment || editingPayment !== null}
        onClose={() => {
          setIsAddingPayment(false);
          setEditingPayment(null);
        }}
        title={editingPayment ? t('payments.editTitle') : t('payments.addTitle')}
      >
        <div className={styles.formGrid}>
          <TextInput
            label={t('payments.dueDate')}
            type="date"
            value={draft.dueDate}
            onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
          />
          <TextInput
            label={t('payments.amount')}
            type="number"
            step="0.01"
            min="0"
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
          />
          <TextInput
            label={t('payments.recordMethod')}
            placeholder={t('payments.recordMethodPlaceholder')}
            value={draft.method}
            onChange={(e) => setDraft({ ...draft, method: e.target.value })}
          />
          <div className={styles.formGridFull}>
            <TextareaInput
              label={t('payments.recordNote')}
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.modalActions}>
          <Button
            variant="outline"
            onClick={() => {
              setIsAddingPayment(false);
              setEditingPayment(null);
            }}
          >
            {tc('action.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={submitDraft}
            disabled={actions.loading || !draft.dueDate || draft.amount === ''}
          >
            {t('payments.save')}
          </Button>
        </div>
      </Modal>
    </div>
  );
};
