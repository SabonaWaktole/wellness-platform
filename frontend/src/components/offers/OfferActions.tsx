import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Download, Eye, FileCheck, Pencil, RefreshCw, Send, Undo2, X } from 'lucide-react';
import { Button } from '../ui/Button/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog/ConfirmDialog';
import { SelectInput } from '../ui/SelectInput/SelectInput';
import { TextInput } from '../ui/TextInput/TextInput';
import { TextareaInput } from '../ui/TextareaInput/TextareaInput';
import { useToast } from '../ui/Toast/toastContext';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { offerService } from '../../services/offerService';
import type { OfferLanguage, OfferView } from '../../types/offer';
import { downloadBlob } from '../../utils/downloadBlob';
import { offerErrorMessage } from './offerErrorMessage';
import { OfferPdfPreview } from './OfferPdfPreview';
import styles from './OfferActions.module.css';

type Dialog = 'sent' | 'accepted' | 'rejected' | 'revise' | 'approve' | 'rejectDiscount' | 'withdraw' | null;

/** A percentage or an amount as the server accepts it: digits, and up to two decimals (FR-DSC-01, FR-PRC-09). */
const DECIMAL = /^\d+(\.\d{1,2})?$/;

interface OfferActionsProps {
  tenantSlug: string;
  offer: OfferView;
  /** The offer after a step, or the new version after a revision. */
  onChanged: (offer: OfferView) => void;
  /** Opens the pricing screen on the offer's deal (FR-OFR-03: prices change only there). */
  onEdit: () => void;
}

/**
 * What can be done with one offer (M2 Slices 9, 10): preview and download it
 * in Albanian or English (FR-OFR-05, 06), the steps the server says this
 * viewer may take now — mark ready, mark as sent with the date sent, mark
 * accepted or rejected with a note, revise into a new version (FR-OFR-09..12)
 * — and the inline discount approval steps: approve (possibly lower) or
 * reject with a comment, or withdraw the request (FR-DSC-06, 10). There is no
 * "Send by email": the salesperson emails the PDF and marks it as sent
 * (FR-OFR-07).
 */
export const OfferActions: React.FC<OfferActionsProps> = ({ tenantSlug, offer, onChanged, onEdit }) => {
  const { t } = useTranslation('offers');
  const toast = useToast();
  const dates = useDateFormat();
  const isPhone = useMediaQuery('(max-width: 767px)');
  const money = useMoneyFormat();
  const [language, setLanguage] = useState<OfferLanguage>('sq');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [sentDate, setSentDate] = useState('');
  const [note, setNote] = useState('');
  const [approvedPercent, setApprovedPercent] = useState('');
  const [comment, setComment] = useState('');
  const can = (action: OfferView['permittedActions'][number]) => offer.permittedActions.includes(action);
  const pending = offer.pendingApproval;
  // FR-PRC-09: a manual price is approved as a price (any amount above 0), a discount as a
  // percent no higher than requested (FR-DSC-06). `approvedPercent` holds whichever applies.
  const isManual = pending?.kind === 'MANUAL_PRICE';
  const requestedPercent = Number(pending?.requestedPercent ?? NaN);
  const approvedValid =
    pending !== null &&
    DECIMAL.test(approvedPercent.trim()) &&
    (isManual ? Number(approvedPercent) > 0 : Number(approvedPercent) >= 0 && Number(approvedPercent) <= requestedPercent);
  const requestedPrice = pending?.requestedMonthlyPrice ? money.format(Number(pending.requestedMonthlyPrice)) : '';

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const fail = (error: unknown) => toast.error(offerErrorMessage(error, t));

  const fetchPdf = async (disposition: 'inline' | 'attachment') => {
    setBusy(true);
    try {
      return await offerService.pdf(tenantSlug, offer.id, language, disposition);
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    try {
      const { blob, fileName } = await fetchPdf('inline');
      if (isPhone) downloadBlob(blob, fileName ?? `${offer.reference}.pdf`, { open: true });
      else setPreviewUrl(URL.createObjectURL(blob));
    } catch (error) {
      fail(error);
    }
  };

  const download = async () => {
    try {
      const { blob, fileName } = await fetchPdf('attachment');
      downloadBlob(blob, fileName ?? `${offer.reference}.pdf`);
    } catch (error) {
      fail(error);
    }
  };

  /** Runs one step; a refusal keeps the dialog open with the reason in a toast. */
  const step = async (work: () => Promise<OfferView>, success: string) => {
    try {
      const updated = await work();
      toast.success(success);
      setDialog(null);
      onChanged(updated);
    } catch (error) {
      fail(error);
      throw error;
    }
  };

  const open = (next: Dialog) => {
    setNote('');
    setComment('');
    setApprovedPercent((isManual ? pending?.requestedMonthlyPrice : pending?.requestedPercent) ?? '');
    setSentDate(dates.dayKey(new Date()));
    setDialog(next);
  };

  const today = dates.dayKey(new Date());

  return (
    <div className={styles.actions}>
      <Button variant="outline" size="sm" icon={<Eye size={16} />} onClick={preview} disabled={busy}>
        {t('actions.preview')}
      </Button>
      <SelectInput
        className={styles.language}
        aria-label={t('actions.language')}
        value={language}
        onChange={(event) => setLanguage(event.target.value as OfferLanguage)}
      >
        <option value="sq">{t('languages.sq')}</option>
        <option value="en">{t('languages.en')}</option>
      </SelectInput>
      <Button variant="outline" size="sm" icon={<Download size={16} />} onClick={download} disabled={busy}>
        {t('actions.download')}
      </Button>

      {can('EDIT') && (
        <Button variant="ghost" size="sm" icon={<Pencil size={16} />} onClick={onEdit}>
          {t('actions.edit')}
        </Button>
      )}
      {can('MARK_READY') && (
        <Button
          size="sm"
          icon={<FileCheck size={16} />}
          onClick={() => step(() => offerService.markReady(tenantSlug, offer.id), t('done.ready')).catch(() => undefined)}
        >
          {t('actions.markReady')}
        </Button>
      )}
      {can('MARK_SENT') && (
        <Button size="sm" icon={<Send size={16} />} onClick={() => open('sent')}>
          {t('actions.markSent')}
        </Button>
      )}
      {can('MARK_ACCEPTED') && (
        <Button variant="success" size="sm" icon={<Check size={16} />} onClick={() => open('accepted')}>
          {t('actions.markAccepted')}
        </Button>
      )}
      {can('MARK_REJECTED') && (
        <Button variant="outline" size="sm" icon={<X size={16} />} onClick={() => open('rejected')}>
          {t('actions.markRejected')}
        </Button>
      )}
      {can('REVISE') && (
        <Button variant="ghost" size="sm" icon={<RefreshCw size={16} />} onClick={() => open('revise')}>
          {t('actions.revise')}
        </Button>
      )}
      {can('APPROVE_DISCOUNT') && pending && (
        <Button variant="success" size="sm" icon={<Check size={16} />} onClick={() => open('approve')}>
          {t('actions.approve')}
        </Button>
      )}
      {can('REJECT_DISCOUNT') && pending && (
        <Button variant="outline" size="sm" icon={<X size={16} />} onClick={() => open('rejectDiscount')}>
          {t('actions.reject')}
        </Button>
      )}
      {can('WITHDRAW_APPROVAL') && pending && (
        <Button variant="ghost" size="sm" icon={<Undo2 size={16} />} onClick={() => open('withdraw')}>
          {t('actions.withdraw')}
        </Button>
      )}

      {offer.status === 'PENDING_APPROVAL' && pending && (
        <p className={styles.notice} role="status">
          {isManual
            ? t('approval.waitingManual', { price: requestedPrice })
            : t('approval.waiting', { percent: pending.requestedPercent })}{' '}
          {t('approval.requestedBy', { name: pending.requestedByName })}{' '}
          {t('approval.reason', { reason: pending.reason })}
        </p>
      )}

      <OfferPdfPreview url={previewUrl} reference={offer.reference} onClose={() => setPreviewUrl(null)} />

      <ConfirmDialog
        isOpen={dialog === 'sent'}
        onClose={() => setDialog(null)}
        title={t('sent.title', { reference: offer.reference })}
        confirmLabel={t('actions.markSent')}
        tone="primary"
        confirmDisabled={!sentDate || sentDate > today}
        onConfirm={() => step(() => offerService.markSent(tenantSlug, offer.id, sentDate), t('done.sent'))}
        message={
          <>
            <p>{t('sent.message')}</p>
            <div className={styles.dialogField}>
              <TextInput
                type="date"
                label={t('sent.date')}
                value={sentDate}
                max={today}
                onChange={(event) => setSentDate(event.target.value)}
                required
              />
            </div>
          </>
        }
      />
      <ConfirmDialog
        isOpen={dialog === 'accepted'}
        onClose={() => setDialog(null)}
        title={t('accepted.title', { reference: offer.reference })}
        confirmLabel={t('actions.markAccepted')}
        tone="primary"
        onConfirm={() => step(() => offerService.markAccepted(tenantSlug, offer.id, note.trim() || null), t('done.accepted'))}
        message={
          <>
            <p>{t('accepted.message')}</p>
            <div className={styles.dialogField}>
              <TextareaInput label={t('response.note')} value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={2000} />
            </div>
          </>
        }
      />
      <ConfirmDialog
        isOpen={dialog === 'rejected'}
        onClose={() => setDialog(null)}
        title={t('rejected.title', { reference: offer.reference })}
        confirmLabel={t('actions.markRejected')}
        tone="danger"
        onConfirm={() => step(() => offerService.markRejected(tenantSlug, offer.id, note.trim() || null), t('done.rejected'))}
        message={
          <>
            <p>{t('rejected.message')}</p>
            <div className={styles.dialogField}>
              <TextareaInput label={t('response.note')} value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={2000} />
            </div>
          </>
        }
      />
      <ConfirmDialog
        isOpen={dialog === 'revise'}
        onClose={() => setDialog(null)}
        title={t('revise.title', { reference: offer.reference })}
        confirmLabel={t('actions.revise')}
        tone="primary"
        onConfirm={() => step(() => offerService.revise(tenantSlug, offer.id), t('done.revised'))}
        message={<p>{t('revise.message', { number: offer.number ?? offer.reference, version: offer.version + 1 })}</p>}
      />
      {pending && (
        <ConfirmDialog
          isOpen={dialog === 'approve'}
          onClose={() => setDialog(null)}
          title={
            isManual
              ? t('approval.approveManualTitle', { price: requestedPrice, reference: offer.reference })
              : t('approval.approveTitle', { percent: pending.requestedPercent, reference: offer.reference })
          }
          confirmLabel={t('actions.approve')}
          tone="primary"
          confirmDisabled={!approvedValid}
          onConfirm={() =>
            step(
              () =>
                offerService.approveDiscount(
                  tenantSlug,
                  pending.id,
                  isManual ? { approvedMonthlyPrice: approvedPercent.trim() } : { approvedPercent: approvedPercent.trim() },
                  comment.trim() === '' ? null : comment.trim()
                ),
              t('done.approved')
            )
          }
          message={
            <>
              <p>{t(isManual ? 'approval.approveManualMessage' : 'approval.approveMessage')}</p>
              <div className={styles.dialogField}>
                <TextInput
                  label={t(isManual ? 'approval.approvedPrice' : 'approval.approvedPercent')}
                  inputMode="decimal"
                  value={approvedPercent}
                  error={
                    approvedPercent.trim() !== '' && !approvedValid
                      ? isManual
                        ? t('approval.approvePriceInvalid')
                        : t('approval.approveInvalid', { requested: pending.requestedPercent })
                      : undefined
                  }
                  onChange={(event) => setApprovedPercent(event.target.value)}
                  required
                />
                <TextareaInput
                  label={t('approval.comment')}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={3}
                  maxLength={2000}
                />
              </div>
            </>
          }
        />
      )}
      {pending && (
        <ConfirmDialog
          isOpen={dialog === 'rejectDiscount'}
          onClose={() => setDialog(null)}
          title={
            isManual
              ? t('approval.rejectManualTitle', { price: requestedPrice, reference: offer.reference })
              : t('approval.rejectTitle', { percent: pending.requestedPercent, reference: offer.reference })
          }
          confirmLabel={t('actions.reject')}
          tone="danger"
          confirmDisabled={comment.trim() === ''}
          onConfirm={() => step(() => offerService.rejectDiscount(tenantSlug, pending.id, comment.trim()), t('done.discountRejected'))}
          message={
            <>
              <p>{t(isManual ? 'approval.rejectManualMessage' : 'approval.rejectMessage')}</p>
              <div className={styles.dialogField}>
                <TextareaInput
                  label={t('approval.comment')}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={3}
                  maxLength={2000}
                  required
                />
              </div>
            </>
          }
        />
      )}
      <ConfirmDialog
        isOpen={dialog === 'withdraw'}
        onClose={() => setDialog(null)}
        title={t('approval.withdrawTitle')}
        confirmLabel={t('actions.withdraw')}
        tone="primary"
        onConfirm={() =>
          pending
            ? step(() => offerService.withdrawApproval(tenantSlug, pending.id), t('done.withdrawn'))
            : Promise.reject(new Error('No pending approval'))
        }
        message={<p>{t('approval.withdrawMessage')}</p>}
      />
    </div>
  );
};
