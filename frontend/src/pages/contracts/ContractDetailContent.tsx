import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { Card } from '../../components/ui/Card/Card';
import { Badge } from '../../components/ui/Badge/Badge';
import type { BadgeProps } from '../../components/ui/Badge/Badge';
import { Button } from '../../components/ui/Button/Button';
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

const statusVariant = (status: string): BadgeProps['variant'] => {
  switch (status) {
    case 'DRAFT': return 'secondary';
    case 'ACTIVE': return 'success';
    case 'EXPIRED': return 'warning';
    case 'CANCELLED': return 'error';
    default: return 'secondary';
  }
};

const paymentVariant = (status: string): BadgeProps['variant'] => {
  switch (status) {
    case 'PAID': return 'success';
    case 'PARTIAL': return 'warning';
    case 'WAIVED': return 'secondary';
    default: return 'secondary';
  }
};

/** Draft state for the add/edit payment modal. */
interface PaymentDraft {
  dueDate: string;
  amount: string;
  method: string;
  note: string;
}

const emptyDraft: PaymentDraft = { dueDate: '', amount: '', method: '', note: '' };

export const ContractDetailContent: React.FC = () => {
  const { t } = useTranslation('contracts');
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

  const [confirm, setConfirm] = useState<null | 'ACTIVATE' | 'CANCEL' | 'DOCUMENT'>(null);
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

  const handleActivate = async () => {
    if (!contractId) return;
    await actions.activateContract(contractId);
    setConfirm(null);
    await reload();
  };

  const handleCancel = async () => {
    if (!contractId) return;
    await actions.cancelContract(contractId);
    setConfirm(null);
    await reload();
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
    await actions.uploadDocument(contractId, file);
    await reload();
  };

  const removeDocument = async () => {
    if (!contractId) return;
    await actions.removeDocument(contractId);
    setConfirm(null);
    await reload();
  };

  if (loading && !detail) {
    return <div className={styles.container}>{t('detail.loading')}</div>;
  }

  if (!contract) {
    return <div className={styles.container}>{t('detail.loading')}</div>;
  }

  const reference = contractReference(contract.id);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('detail.breadcrumb', { reference })}</div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{t('detail.title', { reference })}</h1>
            <Badge variant={statusVariant(contract.status)}>
              {statusLabel.contract(contract.status)}
            </Badge>
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
          {can('ACTIVATE') && (
            <Button variant="primary" icon={<Check size={16} />} onClick={() => setConfirm('ACTIVATE')}>
              {t('detail.activate')}
            </Button>
          )}
          {can('RENEW') && (
            <Button variant="primary" icon={<RotateCcw size={16} />} onClick={handleRenew}>
              {t('detail.renew')}
            </Button>
          )}
          {can('CANCEL') && (
            <Button variant="outline" icon={<X size={16} />} onClick={() => setConfirm('CANCEL')}>
              {t('detail.cancel')}
            </Button>
          )}
        </div>
      </div>

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
              <div className={styles.termRow}>
                <dt className={styles.termLabel}>{t('detail.billingPeriod')}</dt>
                <dd className={styles.termValue}>
                  {statusLabel.billingPeriod(contract.billingPeriod)}
                </dd>
              </div>
              <div className={styles.termRow}>
                <dt className={styles.termLabel}>{t('detail.amount')}</dt>
                <dd className={styles.termValue}>{formatMoney(contract.amount)}</dd>
              </div>
              <div className={styles.termRow}>
                <dt className={styles.termLabel}>{t('detail.startsAt')}</dt>
                <dd className={styles.termValue}>{dates.dateMedium(contract.startsAt)}</dd>
              </div>
              <div className={styles.termRow}>
                <dt className={styles.termLabel}>{t('detail.endsAt')}</dt>
                <dd className={styles.termValue}>{dates.dateMedium(contract.endsAt)}</dd>
              </div>
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
            </dl>
          </Card>

          <Card padding="lg">
            <h2 className={styles.cardTitle}>{t('detail.document')}</h2>
            {contract.documentUrl ? (
              <div className={styles.documentRow}>
                <a
                  className={styles.documentLink}
                  href={contract.documentUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText size={16} />
                  {contract.documentName}
                </a>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  {t('detail.replaceDocument')}
                </Button>
                <Button variant="outline" onClick={() => setConfirm('DOCUMENT')}>
                  {t('detail.removeDocument')}
                </Button>
              </div>
            ) : (
              <div className={styles.documentRow}>
                <p className={styles.notesEmpty}>{t('detail.noDocument')}</p>
                <Button
                  variant="outline"
                  icon={<Paperclip size={16} />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t('detail.uploadDocument')}
                </Button>
              </div>
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
                            {payment.status === 'PARTIAL' && (
                              <span className={styles.partialHint}>
                                {t('payments.outstandingOf', {
                                  outstanding: formatMoney(payment.outstanding),
                                  amount: formatMoney(payment.amount),
                                })}
                              </span>
                            )}
                          </td>
                          <td>
                            <Badge variant={paymentVariant(payment.status)}>
                              {statusLabel.contractPayment(payment.status)}
                            </Badge>
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
                              {can('RECORD_PAYMENT') && payment.status !== 'UNPAID' && (
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
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirm === 'ACTIVATE'}
        onClose={() => setConfirm(null)}
        onConfirm={handleActivate}
        title={t('detail.activate')}
        message={t('detail.confirmActivate')}
        tone="primary"
      />

      <ConfirmDialog
        isOpen={confirm === 'CANCEL'}
        onClose={() => setConfirm(null)}
        onConfirm={handleCancel}
        title={t('detail.cancel')}
        message={t('detail.confirmCancel')}
      />

      <ConfirmDialog
        isOpen={confirm === 'DOCUMENT'}
        onClose={() => setConfirm(null)}
        onConfirm={removeDocument}
        title={t('detail.removeDocument')}
        message={t('detail.confirmRemoveDocument')}
      />

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
