import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button/Button';
import { Modal } from '../../components/ui/Modal/Modal';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { useToast } from '../../components/ui/Toast/toastContext';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { dealService } from '../../services/dealService';
import { followUpService } from '../../services/followUpService';
import { lookupService, type LostReason } from '../../services/lookupService';
import { OPEN_DEAL_STAGES } from '../../types/deal';
import type { DealDetail, DealStage, DealSummary } from '../../types/deal';
import type { OfferView } from '../../types/offer';
import { lookupLabel } from '../../utils/lookupLabel';
import { dealErrorMessage } from './dealErrors';
import styles from './DealDetailContent.module.css';

interface ClosingModalProps {
  tenantSlug: string;
  /** The board opens these from a card, which knows no more than this. */
  deal: Pick<DealSummary, 'id' | 'ownerName'>;
  isOpen: boolean;
  onClose: () => void;
  /** The deal as it is after the action. */
  onDone: (deal: DealDetail) => void;
}

/** Offers a deal can win with: the latest version, Ready, Sent or Accepted (FR-DEAL-14). */
const winnable = (offer: OfferView) => !offer.superseded && ['READY', 'SENT', 'ACCEPTED'].includes(offer.status);

/**
 * FR-DEAL-14, 15: the values come from the offer and are read-only; the
 * salesperson sets the closing date and confirms closing the deal's open
 * follow-ups. Without `commercial.view` the figures are not shown, but the
 * server still wins with the latest qualifying offer.
 */
export const WinDealModal: React.FC<ClosingModalProps & { offerId?: string }> = ({ tenantSlug, deal, isOpen, onClose, onDone, offerId }) => {
  const { t } = useTranslation('deals');
  const toast = useToast();
  const dates = useDateFormat();
  const money = useMoneyFormat();
  const [offer, setOffer] = useState<OfferView | null>(null);
  const [offersHidden, setOffersHidden] = useState(false);
  const [followUps, setFollowUps] = useState(0);
  const [closingDate, setClosingDate] = useState('');
  const [closeFollowUps, setCloseFollowUps] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setClosingDate(dates.dayKey(new Date()));
    setCloseFollowUps(true);
    setOffer(null);
    setOffersHidden(false);
    let cancelled = false;
    dealService
      .offers(tenantSlug, deal.id)
      .then((offers) => {
        if (cancelled) return;
        const candidates = offers.filter(winnable);
        setOffer(candidates.find((candidate) => candidate.id === offerId) ?? candidates[0] ?? null);
      })
      .catch(() => !cancelled && setOffersHidden(true));
    followUpService
      .list(tenantSlug, { dealId: deal.id })
      .then((items) => !cancelled && setFollowUps(items.length))
      .catch(() => !cancelled && setFollowUps(0));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, deal.id, offerId, tenantSlug]);

  const save = async () => {
    setSaving(true);
    try {
      const won = await dealService.win(tenantSlug, deal.id, { offerId: offer?.id, closingDate: closingDate || undefined, closeFollowUps });
      toast.success(t('win.done'));
      onDone(won);
    } catch (error) {
      toast.error(dealErrorMessage(error, t));
    } finally {
      setSaving(false);
    }
  };

  const noOffer = !offersHidden && offer === null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('win.title')} maxWidth="sm">
      <div className={styles.modalBody}>
        {noOffer && <p role="alert">{t('win.noOffer')}</p>}
        {offer && (
          <dl className={styles.facts} aria-label={t('win.fromOffer', { reference: offer.reference })}>
            <div className={styles.fact}>
              <dt>{t('win.offer')}</dt>
              <dd>{offer.reference}</dd>
            </div>
            {offer.netMonthlyPrice != null && (
              <div className={styles.fact}>
                <dt>{t('win.monthly')}</dt>
                <dd>{t('perMonth', { amount: money.format(Number(offer.netMonthlyPrice)) })}</dd>
              </div>
            )}
            {offer.annualValue != null && (
              <div className={styles.fact}>
                <dt>{t('win.annual')}</dt>
                <dd>{t('perYear', { amount: money.format(Number(offer.annualValue)) })}</dd>
              </div>
            )}
            <div className={styles.fact}>
              <dt>{t('win.salesperson')}</dt>
              <dd>{deal.ownerName}</dd>
            </div>
          </dl>
        )}
        {offersHidden && <p className={styles.muted}>{t('win.figuresHidden')}</p>}
        <TextInput type="date" label={t('win.closingDate')} value={closingDate} max={dates.dayKey(new Date())} onChange={(event) => setClosingDate(event.target.value)} required />
        {followUps > 0 && (
          <label className={styles.checkRow}>
            <input type="checkbox" checked={closeFollowUps} onChange={(event) => setCloseFollowUps(event.target.checked)} />
            <span>{t('win.closeFollowUps', { count: followUps })}</span>
          </label>
        )}
        <div className={styles.modalActions}>
          <Button variant="ghost" onClick={onClose}>
            {t('form.cancel')}
          </Button>
          <Button variant="primary" onClick={save} isLoading={saving} disabled={noOffer || !closingDate}>
            {t('win.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

/** FR-DEAL-16: a required reason from the active lost reasons, and a note. */
export const LoseDealModal: React.FC<ClosingModalProps> = ({ tenantSlug, deal, isOpen, onClose, onDone }) => {
  const { t, i18n } = useTranslation('deals');
  const toast = useToast();
  const [reasons, setReasons] = useState<LostReason[]>([]);
  const [reasonId, setReasonId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setReasonId('');
    setNote('');
    lookupService.list(tenantSlug, 'lost-reasons').then(setReasons).catch(() => toast.error(t('lose.reasonsFailed')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tenantSlug]);

  const save = async () => {
    setSaving(true);
    try {
      onDone(await dealService.lose(tenantSlug, deal.id, { reasonId, note: note.trim() || null }));
      toast.success(t('lose.done'));
    } catch (error) {
      toast.error(dealErrorMessage(error, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('lose.title')} maxWidth="sm">
      <div className={styles.modalBody}>
        <p className={styles.muted}>{t('lose.hint')}</p>
        <SelectInput label={t('lose.reason')} value={reasonId} onChange={(event) => setReasonId(event.target.value)} required>
          <option value="" disabled>
            —
          </option>
          {reasons.map((reason) => (
            <option key={reason.id} value={reason.id}>
              {lookupLabel(reason, i18n.language)}
            </option>
          ))}
        </SelectInput>
        <TextareaInput label={t('lose.note')} rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
        <div className={styles.modalActions}>
          <Button variant="ghost" onClick={onClose}>
            {t('form.cancel')}
          </Button>
          <Button variant="danger" onClick={save} isLoading={saving} disabled={!reasonId}>
            {t('lose.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

/** FR-DEAL-17: for `deals.reopen`, into an open stage, with a comment. */
export const ReopenDealModal: React.FC<ClosingModalProps> = ({ tenantSlug, deal, isOpen, onClose, onDone }) => {
  const { t } = useTranslation('deals');
  const toast = useToast();
  const statusLabel = useStatusLabel();
  const [stage, setStage] = useState<DealStage>('NEGOTIATION');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStage('NEGOTIATION');
    setComment('');
  }, [isOpen]);

  const save = async () => {
    setSaving(true);
    try {
      onDone(await dealService.reopen(tenantSlug, deal.id, stage, comment.trim()));
      toast.success(t('reopen.done'));
    } catch (error) {
      toast.error(dealErrorMessage(error, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('reopen.title')} maxWidth="sm">
      <div className={styles.modalBody}>
        <SelectInput label={t('reopen.stage')} value={stage} onChange={(event) => setStage(event.target.value as DealStage)}>
          {OPEN_DEAL_STAGES.map((open) => (
            <option key={open} value={open}>
              {statusLabel.deal(open)}
            </option>
          ))}
        </SelectInput>
        <TextareaInput label={t('reopen.comment')} rows={3} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} required />
        <div className={styles.modalActions}>
          <Button variant="ghost" onClick={onClose}>
            {t('form.cancel')}
          </Button>
          <Button variant="primary" onClick={save} isLoading={saving} disabled={!comment.trim()}>
            {t('reopen.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
