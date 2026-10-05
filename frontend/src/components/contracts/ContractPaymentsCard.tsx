import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { Card } from '../ui/Card/Card';
import { Button } from '../ui/Button/Button';
import { Modal } from '../ui/Modal';
import { SlideOver } from '../ui/SlideOver';
import { StatusBadge } from '../ui/StatusBadge/StatusBadge';
import { TextInput } from '../ui/TextInput/TextInput';
import { TextareaInput } from '../ui/TextareaInput/TextareaInput';
import { SelectInput } from '../ui/SelectInput/SelectInput';
import { useContractActions } from '../../hooks/useContracts';
import { usePermission } from '../../hooks/usePermission';
import { paymentService } from '../../services/paymentService';
import { downloadBlob } from '../../utils/downloadBlob';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { useTeam } from '../../hooks/useTeam';
import { findPersonById, getStaffDisplayName } from '../../utils/userUtils';
import { PAYMENT_METHODS } from '../../types/contract';
import type { ContractPayment, ContractPaymentHistoryEntry, InstalmentSummary } from '../../types/contract';
import styles from './ContractPaymentsCard.module.css';

/** What the drawer is asking for. One form at a time. */
type Mode = 'invoice' | 'receipt' | 'reverse' | 'correct' | 'edit' | 'remove';

/** The statuses an instalment passes through before money arrives, in order (FR-PAY-06). */
const EARLIER_STATUSES = ['NOT_INVOICED', 'INVOICE_ISSUED', 'PAYMENT_PENDING'] as const;

/** Instalments can be added to a contract that has been activated, not before (FR-PAY-04). */
const ADD_STATUSES = new Set(['ACTIVE', 'SUSPENDED', 'EXPIRED']);

const today = () => new Date().toISOString().slice(0, 10);
const toDateInput = (value: string | null | undefined) => (value ? new Date(value).toISOString().slice(0, 10) : '');
/** A two-decimal string with nothing in it: compared as text, never calculated (NFR-ACC-03). */
const isZeroMoney = (value: string) => /^-?0+(\.0+)?$/.test(value);

/** Money has landed on this instalment. Without amounts (no commercial.view) the status says so. */
const hasReceived = (payment: ContractPayment) =>
  payment.paidAmount !== undefined
    ? !isZeroMoney(payment.paidAmount)
    : payment.status === 'PARTIALLY_PAID' || payment.status === 'PAID';

const earlierStatuses = (payment: ContractPayment) => {
  if (hasReceived(payment) || payment.status === 'WAIVED') return [];
  const rank = payment.status === 'OVERDUE' ? EARLIER_STATUSES.length : EARLIER_STATUSES.indexOf(payment.status as never);
  return rank > 0 ? EARLIER_STATUSES.slice(0, rank) : [];
};

const emptyForm = {
  invoiceNumber: '',
  invoiceDate: '',
  amount: '',
  receivedOn: '',
  method: 'BANK_TRANSFER',
  dueDate: '',
  note: '',
  comment: '',
  status: '',
};

export interface ContractPaymentsCardProps {
  contractId: string;
  contractStatus: string;
  payments: ContractPayment[];
  summary?: InstalmentSummary;
  /** `payments.update`: the controls appear only for it (FR-PAY-05). The server checks again. */
  canUpdate: boolean;
  /** Called after every successful change, to read the contract again. */
  onChanged: () => Promise<void> | void;
}

/**
 * The contract's Payments card (FR-PAY-03..08, 10, 12): the schedule, its summary
 * and, per instalment, a drawer with the history and the actions. It shows what
 * the server sent and works nothing out: amounts are strings, the summary and the
 * "due, not invoiced" flag come from the server (SRS §2.4). Without `commercial.view`
 * the amounts are absent and so are their columns.
 */
export const ContractPaymentsCard: React.FC<ContractPaymentsCardProps> = ({
  contractId,
  contractStatus,
  payments,
  summary,
  canUpdate,
  onChanged,
}) => {
  const { t } = useTranslation('contracts');
  const { t: tc } = useTranslation('common');
  const dates = useDateFormat();
  const { format: formatMoney } = useMoneyFormat();
  const statusLabel = useStatusLabel();
  const actions = useContractActions();
  const { tenantSlug } = useParams();
  const canExport = usePermission('payments.view');
  const { staff, fetchStaff } = useTeam();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<ContractPaymentHistoryEntry[]>([]);
  const [mode, setMode] = useState<Mode | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState(false);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const selected = useMemo(() => payments.find((p) => p.id === selectedId) ?? null, [payments, selectedId]);
  const showAmounts = payments.some((p) => p.amount !== undefined) || summary?.total !== undefined;

  const loadHistory = useCallback(
    async (paymentId: string) => {
      try {
        setHistory(await actions.fetchPaymentHistory(contractId, paymentId));
      } catch {
        setHistory([]);
      }
    },
    // The hook returns a new object every render; its calls only depend on the contract id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contractId]
  );

  const open = (payment: ContractPayment) => {
    setSelectedId(payment.id);
    setMode(null);
    setError(null);
    setHistory([]);
    void loadHistory(payment.id);
  };

  const close = () => {
    setSelectedId(null);
    setMode(null);
    setError(null);
  };

  const startMode = (next: Mode, payment: ContractPayment) => {
    setError(null);
    setForm({
      ...emptyForm,
      invoiceDate: today(),
      receivedOn: today(),
      amount: next === 'receipt' ? (payment.outstanding ?? '') : next === 'edit' ? (payment.amount ?? '') : '',
      dueDate: toDateInput(payment.dueDate),
      note: payment.note ?? '',
      status: earlierStatuses(payment)[earlierStatuses(payment).length - 1] ?? '',
    });
    setMode(next);
  };

  const set = (field: keyof typeof emptyForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  /** Runs one action, shows the server's refusal as it is, and reads everything again after a success. */
  const run = async (work: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await onChanged();
      if (selectedId) await loadHistory(selectedId);
      setMode(null);
      after?.();
    } catch (err: any) {
      const message = err?.response?.data?.error;
      setError(typeof message === 'string' ? message : Array.isArray(message) ? message.map((m: any) => m.message).join(' ') : t('payments.failed'));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (!selected) return;
    const id = selected.id;
    const comment = form.comment.trim();
    switch (mode) {
      case 'invoice':
        return run(() => actions.paymentAction(contractId, id, 'invoice', { invoiceNumber: form.invoiceNumber, invoiceDate: form.invoiceDate }));
      case 'receipt':
        return run(() =>
          actions.paymentAction(contractId, id, 'receipts', { amount: form.amount, receivedOn: form.receivedOn, method: form.method, comment: comment || null })
        );
      case 'reverse':
        return run(() => actions.paymentAction(contractId, id, 'receipts/reverse', { amount: form.amount, comment }));
      case 'correct':
        return run(() => actions.paymentAction(contractId, id, 'correct', { status: form.status, comment }));
      case 'edit':
        return run(() =>
          actions.updatePayment(contractId, id, {
            ...(form.dueDate !== toDateInput(selected.dueDate) ? { dueDate: form.dueDate } : {}),
            ...(form.amount !== (selected.amount ?? form.amount) ? { amount: form.amount } : {}),
            note: form.note.trim() || null,
            reason: comment || undefined,
          })
        );
      case 'remove':
        return run(() => actions.deletePayment(contractId, id, comment), close);
      default:
        return undefined;
    }
  };

  const submitAdd = () =>
    run(
      () => actions.addPayment(contractId, { dueDate: form.dueDate, amount: form.amount, reason: form.comment.trim(), note: form.note.trim() || null }),
      () => setAdding(false)
    );

  const actorName = (id: string | null) => {
    if (!id) return t('payments.system');
    const person = findPersonById(staff, id);
    return person ? getStaffDisplayName(person) : id;
  };

  const historyTitle = (entry: ContractPaymentHistoryEntry) => {
    const amount = entry.amountReceived !== undefined ? formatMoney(entry.amountReceived) : '';
    if (entry.fromStatus === 'NONE') return t('payments.historyAdded');
    if (entry.amountReceived !== undefined && entry.amountReceived.startsWith('-')) return t('payments.historyReversed', { amount: formatMoney(entry.amountReceived.slice(1)) });
    if (entry.receivedOn) return amount ? t('payments.historyReceipt', { amount }) : t('payments.historyReceiptNoAmount');
    if (entry.fromStatus === entry.toStatus) return t('payments.historyChanged');
    return `${statusLabel.contractPayment(entry.fromStatus)} → ${statusLabel.contractPayment(entry.toStatus)}`;
  };

  const methodLabel = (method: string | null) =>
    !method ? '—' : (PAYMENT_METHODS as readonly string[]).includes(method) ? t(`payments.method.${method}`) : method;

  const canAdd = canUpdate && ADD_STATUSES.has(contractStatus);
  const reasonRequired = mode === 'reverse' || mode === 'correct' || mode === 'remove' || (mode === 'edit' && selected !== null && (form.dueDate !== toDateInput(selected.dueDate) || (selected.amount !== undefined && form.amount !== selected.amount)));
  const submitDisabled =
    busy ||
    (mode === 'invoice' && (form.invoiceNumber.trim() === '' || form.invoiceDate === '')) ||
    (mode === 'receipt' && (form.amount === '' || form.receivedOn === '')) ||
    (mode === 'reverse' && form.amount === '') ||
    (mode === 'correct' && form.status === '') ||
    (reasonRequired && form.comment.trim() === '');

  const formTitle: Record<Mode, string> = {
    invoice: t('payments.recordInvoice'),
    receipt: t('payments.recordReceipt'),
    reverse: t('payments.reverseReceipt'),
    correct: t('payments.correctStatus'),
    edit: t('payments.change'),
    remove: t('payments.remove'),
  };

  return (
    <Card padding="lg">
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{t('payments.heading')}</h2>
        <div className={styles.headerActions}>
          {canExport && payments.length > 0 && (
            <Button
              variant="outline"
              icon={<Download size={16} />}
              onClick={async () => {
                if (!tenantSlug) return;
                setExportError(false);
                try {
                  // The same export as the Payments overview, for this contract (FR-PAY-14).
                  downloadBlob(await paymentService.downloadCsv(tenantSlug, { contractId }), `payments-${contractId.split('-')[0]}.csv`);
                } catch {
                  setExportError(true);
                }
              }}
            >
              {t('payments.exportCsv')}
            </Button>
          )}
          {canAdd && (
            <Button
              variant="outline"
              icon={<Plus size={16} />}
              onClick={() => {
                setError(null);
                setForm({ ...emptyForm, dueDate: today() });
                setAdding(true);
              }}
            >
              {t('payments.addPayment')}
            </Button>
          )}
        </div>
      </div>

      {exportError && (
        <div className={styles.error} role="alert">
          {t('payments.exportFailed')}
        </div>
      )}

      {summary && (
        <div className={styles.summaryGrid}>
          {summary.total !== undefined && (
            <div className={styles.summaryTile}>
              <span className={styles.summaryLabel}>{t('payments.summaryTotal')}</span>
              <span className={styles.summaryValue}>{formatMoney(summary.total)}</span>
            </div>
          )}
          {summary.received !== undefined && (
            <div className={styles.summaryTile}>
              <span className={styles.summaryLabel}>{t('payments.summaryPaid')}</span>
              <span className={styles.summaryValue}>{formatMoney(summary.received)}</span>
            </div>
          )}
          {summary.outstanding !== undefined && (
            <div className={styles.summaryTile}>
              <span className={styles.summaryLabel}>{t('payments.summaryOutstanding')}</span>
              <span className={`${styles.summaryValue} ${!isZeroMoney(summary.outstanding) ? styles.summaryValueOwed : ''}`}>{formatMoney(summary.outstanding)}</span>
            </div>
          )}
          <div className={styles.summaryTile}>
            <span className={styles.summaryLabel}>{t('payments.summaryNextDue')}</span>
            <span className={styles.summaryValue}>{summary.nextDueDate ? dates.date(summary.nextDueDate) : '—'}</span>
          </div>
          <div className={styles.summaryTile}>
            <span className={styles.summaryLabel}>{t('payments.summaryOverdue')}</span>
            <span className={`${styles.summaryValue} ${summary.overdueCount > 0 ? styles.summaryValueOwed : ''}`}>
              {summary.overdueAmount !== undefined && summary.overdueCount > 0
                ? t('payments.overdueCountAmount', { count: summary.overdueCount, amount: formatMoney(summary.overdueAmount) })
                : summary.overdueCount}
            </span>
          </div>
        </div>
      )}

      {payments.length === 0 ? (
        <div className={styles.emptyMessage}>{contractStatus === 'DRAFT' ? t('payments.notActivated') : t('payments.empty')}</div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('payments.columnDue')}</th>
                {showAmounts && <th>{t('payments.columnAmount')}</th>}
                <th>{t('payments.columnStatus')}</th>
                {showAmounts && <th>{t('payments.columnReceived')}</th>}
                {showAmounts && <th>{t('payments.columnOutstanding')}</th>}
                <th>{t('payments.columnInvoice')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className={payment.status === 'OVERDUE' ? styles.rowOverdue : ''}>
                  <td>
                    {dates.date(payment.dueDate)}
                    {payment.dueNotInvoiced && <span className={styles.flag}>{t('payments.dueNotInvoiced')}</span>}
                  </td>
                  {showAmounts && <td className={styles.amountCell}>{payment.amount !== undefined ? formatMoney(payment.amount) : '—'}</td>}
                  <td>
                    <StatusBadge domain="payment" status={payment.status} />
                  </td>
                  {showAmounts && <td className={styles.muted}>{payment.paidAmount !== undefined ? formatMoney(payment.paidAmount) : '—'}</td>}
                  {showAmounts && <td className={styles.muted}>{payment.outstanding !== undefined ? formatMoney(payment.outstanding) : '—'}</td>}
                  <td className={styles.muted}>{payment.invoiceNumber || '—'}</td>
                  <td>
                    <Button variant="outline" onClick={() => open(payment)}>
                      {t('payments.open')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SlideOver isOpen={selected !== null} onClose={close} title={selected ? t('payments.drawerTitle', { date: dates.date(selected.dueDate) }) : ''}>
        {selected && (
          <>
            <div className={styles.drawerSection}>
              <dl className={styles.facts}>
                <dt>{t('payments.columnStatus')}</dt>
                <dd>
                  <StatusBadge domain="payment" status={selected.status} />
                </dd>
                <dt>{t('payments.dueDate')}</dt>
                <dd>{dates.date(selected.dueDate)}</dd>
                {selected.amount !== undefined && (
                  <>
                    <dt>{t('payments.amount')}</dt>
                    <dd>{formatMoney(selected.amount)}</dd>
                  </>
                )}
                {selected.paidAmount !== undefined && (
                  <>
                    <dt>{t('payments.columnReceived')}</dt>
                    <dd>{formatMoney(selected.paidAmount)}</dd>
                  </>
                )}
                {selected.outstanding !== undefined && (
                  <>
                    <dt>{t('payments.columnOutstanding')}</dt>
                    <dd>{formatMoney(selected.outstanding)}</dd>
                  </>
                )}
                <dt>{t('payments.invoiceNumber')}</dt>
                <dd>{selected.invoiceNumber || '—'}</dd>
                <dt>{t('payments.invoiceDate')}</dt>
                <dd>{selected.invoiceDate ? dates.date(selected.invoiceDate) : '—'}</dd>
                <dt>{t('payments.receivedOn')}</dt>
                <dd>{selected.paidAt ? dates.date(selected.paidAt) : '—'}</dd>
                <dt>{t('payments.methodLabel')}</dt>
                <dd>{methodLabel(selected.method)}</dd>
                <dt>{t('payments.note')}</dt>
                <dd>{selected.note || '—'}</dd>
              </dl>
            </div>

            {canUpdate && mode === null && (
              <div className={`${styles.drawerSection} ${styles.actions}`}>
                {selected.status === 'NOT_INVOICED' && (
                  <Button variant="primary" onClick={() => startMode('invoice', selected)}>
                    {t('payments.recordInvoice')}
                  </Button>
                )}
                {selected.status === 'INVOICE_ISSUED' && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => run(() => actions.paymentAction(contractId, selected.id, 'pending'))}
                  >
                    {t('payments.markPending')}
                  </Button>
                )}
                {selected.status !== 'PAID' && selected.status !== 'WAIVED' && (
                  <Button variant="primary" onClick={() => startMode('receipt', selected)}>
                    {t('payments.recordReceipt')}
                  </Button>
                )}
                {hasReceived(selected) && (
                  <Button variant="outline" onClick={() => startMode('reverse', selected)}>
                    {t('payments.reverseReceipt')}
                  </Button>
                )}
                {earlierStatuses(selected).length > 0 && (
                  <Button variant="outline" onClick={() => startMode('correct', selected)}>
                    {t('payments.correctStatus')}
                  </Button>
                )}
                {!hasReceived(selected) && selected.status !== 'WAIVED' && (
                  <>
                    <Button variant="outline" onClick={() => startMode('edit', selected)}>
                      {t('payments.change')}
                    </Button>
                    <Button variant="outline" onClick={() => startMode('remove', selected)}>
                      {t('payments.remove')}
                    </Button>
                  </>
                )}
              </div>
            )}

            {error && mode === null && (
              <div className={styles.drawerSection} role="alert">
                <div className={styles.error}>{error}</div>
              </div>
            )}

            {canUpdate && mode !== null && (
              <form
                className={`${styles.drawerSection} ${styles.form}`}
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
              >
                <h3 className={styles.drawerHeading}>{formTitle[mode]}</h3>
                {mode === 'invoice' && (
                  <>
                    <TextInput label={t('payments.invoiceNumber')} value={form.invoiceNumber} onChange={set('invoiceNumber')} required />
                    <TextInput label={t('payments.invoiceDate')} type="date" value={form.invoiceDate} onChange={set('invoiceDate')} required />
                  </>
                )}
                {(mode === 'receipt' || mode === 'reverse') && (
                  <TextInput
                    label={t('payments.receiptAmount')}
                    inputMode="decimal"
                    value={form.amount}
                    onChange={set('amount')}
                    helperText={mode === 'receipt' && selected.outstanding !== undefined ? t('payments.receiptAmountHint', { amount: formatMoney(selected.outstanding) }) : undefined}
                    required
                  />
                )}
                {mode === 'receipt' && (
                  <>
                    <TextInput label={t('payments.receivedOn')} type="date" max={today()} value={form.receivedOn} onChange={set('receivedOn')} required />
                    <SelectInput label={t('payments.methodLabel')} value={form.method} onChange={set('method')}>
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {t(`payments.method.${method}`)}
                        </option>
                      ))}
                    </SelectInput>
                  </>
                )}
                {mode === 'correct' && (
                  <SelectInput label={t('payments.correctTo')} value={form.status} onChange={set('status')}>
                    {earlierStatuses(selected).map((status) => (
                      <option key={status} value={status}>
                        {statusLabel.contractPayment(status)}
                      </option>
                    ))}
                  </SelectInput>
                )}
                {mode === 'edit' && (
                  <>
                    <TextInput label={t('payments.dueDate')} type="date" value={form.dueDate} onChange={set('dueDate')} required />
                    {selected.amount !== undefined && (
                      <TextInput label={t('payments.amount')} inputMode="decimal" value={form.amount} onChange={set('amount')} required />
                    )}
                    <TextareaInput label={t('payments.note')} value={form.note} maxLength={1000} onChange={set('note')} />
                  </>
                )}
                {mode === 'remove' && <p>{t('payments.confirmRemove')}</p>}
                <TextareaInput
                  label={reasonRequired ? t('payments.reason') : t('payments.comment')}
                  value={form.comment}
                  maxLength={2000}
                  onChange={set('comment')}
                  required={reasonRequired}
                />
                {error && (
                  <div className={styles.error} role="alert">
                    {error}
                  </div>
                )}
                <div className={styles.formActions}>
                  <Button variant="outline" type="button" onClick={() => setMode(null)}>
                    {tc('action.cancel')}
                  </Button>
                  <Button variant="primary" type="submit" disabled={submitDisabled}>
                    {t('payments.confirm')}
                  </Button>
                </div>
              </form>
            )}

            <div className={styles.drawerSection}>
              <h3 className={styles.drawerHeading}>{t('payments.historyHeading')}</h3>
              {history.length === 0 ? (
                <p className={styles.muted}>{t('payments.historyEmpty')}</p>
              ) : (
                <ol className={styles.historyList}>
                  {history.map((entry) => (
                    <li key={entry.id} className={styles.historyItem}>
                      <span className={styles.historyTitle}>{historyTitle(entry)}</span>
                      <span className={styles.historyMeta}>
                        {actorName(entry.changedByUserId)} · {dates.dateTime(entry.changedAt)}
                        {entry.receivedOn ? ` · ${dates.date(entry.receivedOn)}` : ''}
                        {entry.receivedOn && entry.method ? ` · ${methodLabel(entry.method)}` : ''}
                      </span>
                      {entry.comment && <span className={styles.historyMeta}>{entry.comment}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </SlideOver>

      <Modal isOpen={adding} onClose={() => setAdding(false)} title={t('payments.addTitle')}>
        <div className={styles.formGrid}>
          <TextInput label={t('payments.dueDate')} type="date" value={form.dueDate} onChange={set('dueDate')} required />
          <TextInput label={t('payments.amount')} inputMode="decimal" value={form.amount} onChange={set('amount')} required />
          <div className={styles.formGridFull}>
            <TextInput label={t('payments.note')} value={form.note} onChange={set('note')} />
          </div>
          <div className={styles.formGridFull}>
            <TextareaInput label={t('payments.reason')} value={form.comment} maxLength={2000} onChange={set('comment')} required />
          </div>
        </div>
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}
        <div className={styles.modalActions}>
          <Button variant="outline" onClick={() => setAdding(false)}>
            {tc('action.cancel')}
          </Button>
          <Button variant="primary" onClick={submitAdd} disabled={busy || !form.dueDate || form.amount === '' || form.comment.trim() === ''}>
            {t('payments.save')}
          </Button>
        </div>
      </Modal>
    </Card>
  );
};
