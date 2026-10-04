import { Money } from '../../pricing/domain/Money';
import { Percent } from '../../pricing/domain/Percent';
import { OfferNotEditableError, OfferNotLatestError, OfferNotReadyError, OfferTransitionError } from './offerErrors';
import { QuotationStatus } from './Quotation';

/** The languages an offer is written in (FR-OFR-06). */
export type OfferLanguage = 'sq' | 'en';

/** The amounts calculated on the server when the offer was saved (FR-OFR-03). */
export interface OfferAmounts {
  baseFee: Money;
  riskFee: Money;
  visitFee: Money;
  locationFee: Money;
  listPrice: Money;
  discountPercent: Percent;
  discountAmount: Money;
  netMonthlyPrice: Money;
  /** List price ÷ employees (D8). */
  pricePerEmployee: Money;
  /** Net monthly price × contract months (FR-PRC-10). */
  annualValue: Money;
}

/**
 * A manual monthly price on a "Price on request" offer (FR-PRC-09), with why.
 * The offer's amounts then carry it as both list and net price, without a
 * discount; whether it may go final depends on its approval.
 */
export interface OfferManualPrice {
  monthlyPrice: Money;
  reason: string;
}

/** A service of the offer's package, copied when the offer was saved (FR-PRC-11). */
export interface OfferServiceLine {
  serviceId: string | null;
  nameSq: string;
  nameEn: string | null;
  descriptionSq: string | null;
  descriptionEn: string | null;
}

/**
 * What the pricing screen writes into a draft (FR-OFR-04, D2): the inputs
 * with their labels, the rule values used and the amounts, so the offer
 * reads the same after any setting changes (FR-PCF-10). The snapshots are
 * plain JSON; their shape is the application layer's.
 */
export interface OfferContent {
  employeesPriced: number;
  packageId: string;
  frequencyId: string | null;
  zoneId: string | null;
  pricingInputs: Record<string, unknown>;
  ruleSnapshot: Record<string, unknown>;
  /** NULL on a "Price on request" draft (FR-PRC-07), unless it has a manual price. */
  amounts: OfferAmounts | null;
  /** FR-PRC-09: set only on a "Price on request" offer priced by hand. */
  manualPrice: OfferManualPrice | null;
  services: OfferServiceLine[];
  /** Free text, such as special conditions (FR-OFR-03). */
  note: string | null;
  /** The contact the offer is addressed to; NULL means the company's primary contact (FR-OFR-02). */
  contactPersonId: string | null;
}

export interface OfferProps extends OfferContent {
  id: string;
  tenantId: string;
  clientId: string;
  dealId: string;
  createdByUserId: string;
  status: QuotationStatus;
  language: OfferLanguage;
  /** OF-2026-0001: the same on every version (FR-OFR-08, 11). */
  number: string;
  version: number;
  previousVersionId: string | null;
  /** Set when a later version replaces this one; it is then read-only (FR-OFR-11). */
  supersededAt: Date | null;
  readyAt: Date | null;
  sentAt: Date | null;
  /** The last day the offer is valid, YYYY-MM-DD (FR-OFR-10). */
  validUntil: string | null;
  respondedAt: Date | null;
  /** What the PDF shows besides the offer's own columns, frozen at Ready (D2, FR-OFR-04). */
  renderSnapshot: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The statuses whose PDF is final, without the DRAFT watermark (FR-OFR-09). */
const FINAL_STATUSES: readonly QuotationStatus[] = [
  QuotationStatus.Ready,
  QuotationStatus.Sent,
  QuotationStatus.Accepted,
  QuotationStatus.Rejected,
  QuotationStatus.Expired,
];

/** YYYY-MM-DD plus whole days, on the calendar (no time zone involved). */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const OFFER_NOTE_MAX = 5000;

const cleanNote = (note: string | null): string | null => {
  const trimmed = note?.trim() ?? '';
  return trimmed === '' ? null : trimmed.slice(0, OFFER_NOTE_MAX);
};

/**
 * An offer: a quotation that belongs to a deal (FR-OFR-01). It is created and
 * replaced as a draft from the pricing screen (Slice 8), numbered when it is
 * created (FR-OFR-08), and goes Draft → Ready → Sent → Accepted, Rejected or
 * Expired (FR-OFR-09). A sent offer changes only through a new version with
 * the same number (FR-OFR-11).
 */
export class Offer {
  private constructor(private props: OfferProps) {}

  static draft(input: {
    id: string;
    tenantId: string;
    clientId: string;
    dealId: string;
    createdByUserId: string;
    /** Taken from the yearly sequence when the offer is created (FR-OFR-08). */
    number: string;
    language: OfferLanguage;
    content: OfferContent;
    now: Date;
  }): Offer {
    return new Offer({
      ...input.content,
      note: cleanNote(input.content.note),
      id: input.id,
      tenantId: input.tenantId,
      clientId: input.clientId,
      dealId: input.dealId,
      createdByUserId: input.createdByUserId,
      status: QuotationStatus.Draft,
      language: input.language,
      number: input.number,
      version: 1,
      previousVersionId: null,
      supersededAt: null,
      readyAt: null,
      sentAt: null,
      validUntil: null,
      respondedAt: null,
      renderSnapshot: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  /** An offer as stored. No validation: what is stored was valid when written. */
  static rebuild(props: OfferProps): Offer {
    return new Offer({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get dealId(): string {
    return this.props.dealId;
  }
  get amounts(): OfferAmounts | null {
    return this.props.amounts;
  }
  get manualPrice(): OfferManualPrice | null {
    return this.props.manualPrice;
  }
  get status(): QuotationStatus {
    return this.props.status;
  }
  get number(): string {
    return this.props.number;
  }
  get version(): number {
    return this.props.version;
  }
  get isSuperseded(): boolean {
    return this.props.supersededAt !== null;
  }
  /** Ready and later: the PDF is final, without the DRAFT watermark (FR-OFR-09). */
  get isFinalDocument(): boolean {
    return FINAL_STATUSES.includes(this.props.status);
  }

  /**
   * Saving the pricing screen again replaces the content (FR-PRC-12). A Ready
   * offer has not been sent, so it simply becomes a draft again and loses
   * its frozen snapshot; a sent one changes only through a new version
   * (FR-OFR-11). Returns the status it had.
   */
  replaceDraft(content: OfferContent, now: Date): QuotationStatus {
    if (this.isSuperseded) {
      throw new OfferNotEditableError('A later version replaces this offer.');
    }
    const previous = this.props.status;
    if (previous !== QuotationStatus.Draft && previous !== QuotationStatus.Ready) {
      throw new OfferNotEditableError('Only a draft or a ready offer can be changed; revise a sent one.');
    }
    this.props = {
      ...this.props,
      ...content,
      note: cleanNote(content.note),
      status: QuotationStatus.Draft,
      readyAt: null,
      renderSnapshot: null,
      updatedAt: now,
    };
    return previous;
  }

  /**
   * DRAFT → READY (FR-OFR-09): the offer has a price and its discount is
   * within the cap it was priced with. The details the PDF shows are frozen
   * with it (D2), so the final document no longer follows the settings.
   * An approved above-cap discount passes its approval, which must cover
   * this list price and discount (FR-DSC-08); a manual price needs its own
   * approval (FR-PRC-09).
   */
  markReady(
    now: Date,
    discountCap: Percent,
    renderSnapshot: Record<string, unknown>,
    cover: { discount?: { listPrice: Money; approvedPercent: Percent }; manualPriceApproved?: boolean } = {}
  ): void {
    this.ensureLatest();
    this.ensureStatus(QuotationStatus.Draft, QuotationStatus.Ready);
    const amounts = this.props.amounts;
    if (!amounts) throw new OfferNotReadyError('NO_PRICE');
    if (this.props.manualPrice && !cover.manualPriceApproved) throw new OfferNotReadyError('MANUAL_PRICE_NOT_APPROVED');
    if (amounts.discountPercent.exceeds(discountCap)) {
      const approval = cover.discount;
      const covers =
        approval !== undefined &&
        approval.listPrice.equals(amounts.listPrice) &&
        !amounts.discountPercent.exceeds(approval.approvedPercent);
      if (!covers) throw new OfferNotReadyError('DISCOUNT_ABOVE_CAP');
    }
    this.props = { ...this.props, status: QuotationStatus.Ready, readyAt: now, renderSnapshot, updatedAt: now };
  }

  /**
   * DRAFT → PENDING_APPROVAL (FR-DSC-03, FR-PRC-09): the salesperson asked
   * for a discount above the cap, or proposed a manual price, with a reason. The offer cannot be downloaded as
   * final, marked as sent or used to win until approved.
   */
  requestApproval(now: Date): void {
    this.ensureLatest();
    this.ensureStatus(QuotationStatus.Draft, QuotationStatus.PendingApproval);
    this.props = { ...this.props, status: QuotationStatus.PendingApproval, updatedAt: now };
  }

  /**
   * PENDING_APPROVAL → READY (FR-DSC-06, 07, FR-PRC-09): the approver
   * allowed the discount, possibly a lower percent, or the manual price,
   * possibly another one. The amounts carry what was approved, recomputed by
   * the use case; the frozen details are taken as in `markReady`.
   */
  approvePending(
    price: { amounts: OfferAmounts; manualPrice: OfferManualPrice | null },
    now: Date,
    renderSnapshot: Record<string, unknown>
  ): void {
    this.ensureLatest();
    this.ensureStatus(QuotationStatus.PendingApproval, QuotationStatus.Ready);
    this.props = {
      ...this.props,
      amounts: price.amounts,
      manualPrice: price.manualPrice,
      status: QuotationStatus.Ready,
      readyAt: now,
      renderSnapshot,
      updatedAt: now,
    };
  }

  /**
   * PENDING_APPROVAL → DRAFT (FR-DSC-07, FR-PRC-09): rejected. A discount
   * goes back to the cap (the amounts carry the cap percent, recomputed by
   * the use case); a manual price is dropped, leaving "Price on request".
   * The comment is stored on the status-history row, not here.
   */
  rejectPending(price: { amounts: OfferAmounts | null; manualPrice: OfferManualPrice | null }, now: Date): void {
    this.ensureLatest();
    this.ensureStatus(QuotationStatus.PendingApproval, QuotationStatus.Draft);
    this.props = { ...this.props, amounts: price.amounts, manualPrice: price.manualPrice, status: QuotationStatus.Draft, updatedAt: now };
  }

  /** PENDING_APPROVAL → DRAFT (FR-DSC-10): the salesperson withdrew the request. */
  withdrawPending(now: Date): void {
    this.ensureLatest();
    this.ensureStatus(QuotationStatus.PendingApproval, QuotationStatus.Draft);
    this.props = { ...this.props, status: QuotationStatus.Draft, updatedAt: now };
  }

  /**
   * READY → SENT, by the salesperson after emailing the PDF (FR-OFR-10). The
   * validity runs from the date sent. `sentAt` is noon UTC of that date,
   * which is the same calendar day in the workspace's time zone.
   */
  markSent(sentDay: string, validityDays: number, now: Date): void {
    this.ensureLatest();
    this.ensureStatus(QuotationStatus.Ready, QuotationStatus.Sent);
    this.props = {
      ...this.props,
      status: QuotationStatus.Sent,
      sentAt: new Date(`${sentDay}T12:00:00.000Z`),
      validUntil: addDays(sentDay, validityDays),
      updatedAt: now,
    };
  }

  /** SENT → ACCEPTED (FR-OFR-12). Only the latest version (FR-OFR-11). */
  accept(now: Date): void {
    this.respond(QuotationStatus.Accepted, now);
  }

  /**
   * Winning the deal (FR-DEAL-14, 15): a Ready or Sent latest version becomes
   * Accepted with the deal. Returns false, changing nothing, if it already is.
   */
  acceptForWin(now: Date): boolean {
    this.ensureLatest();
    if (this.props.status === QuotationStatus.Accepted) return false;
    if (this.props.status !== QuotationStatus.Ready && this.props.status !== QuotationStatus.Sent) {
      throw new OfferTransitionError(this.props.status, QuotationStatus.Accepted);
    }
    this.props = { ...this.props, status: QuotationStatus.Accepted, respondedAt: now, updatedAt: now };
    return true;
  }

  /**
   * Losing the deal (FR-DEAL-16): an open offer, whether draft, waiting for
   * approval, ready or sent, becomes Rejected with it.
   */
  rejectForLoss(now: Date): void {
    const open = [QuotationStatus.Draft, QuotationStatus.PendingApproval, QuotationStatus.Ready, QuotationStatus.Sent];
    if (!open.includes(this.props.status)) throw new OfferTransitionError(this.props.status, QuotationStatus.Rejected);
    this.props = { ...this.props, status: QuotationStatus.Rejected, respondedAt: now, updatedAt: now };
  }

  /** SENT → REJECTED (FR-OFR-12). */
  reject(now: Date): void {
    this.respond(QuotationStatus.Rejected, now);
  }

  /** SENT → EXPIRED, past its validity date (FR-OFR-13). */
  expire(now: Date): void {
    this.ensureLatest();
    this.ensureStatus(QuotationStatus.Sent, QuotationStatus.Expired);
    this.props = { ...this.props, status: QuotationStatus.Expired, updatedAt: now };
  }

  /**
   * Changing a sent offer (FR-OFR-11): this version becomes read-only, and
   * the next one starts as a draft with the same number and content, to be
   * priced, made ready and sent again.
   */
  reviseInto(newId: string, userId: string, now: Date): Offer {
    this.ensureLatest();
    this.ensureStatus(QuotationStatus.Sent, QuotationStatus.Draft);
    this.props = { ...this.props, supersededAt: now, updatedAt: now };
    return new Offer({
      ...this.props,
      id: newId,
      createdByUserId: userId,
      status: QuotationStatus.Draft,
      version: this.props.version + 1,
      previousVersionId: this.props.id,
      supersededAt: null,
      readyAt: null,
      sentAt: null,
      validUntil: null,
      respondedAt: null,
      renderSnapshot: null,
      services: this.props.services.map((service) => ({ ...service })),
      createdAt: now,
      updatedAt: now,
    });
  }

  toProps(): OfferProps {
    return { ...this.props };
  }

  private respond(status: QuotationStatus.Accepted | QuotationStatus.Rejected, now: Date): void {
    this.ensureLatest();
    this.ensureStatus(QuotationStatus.Sent, status);
    this.props = { ...this.props, status, respondedAt: now, updatedAt: now };
  }

  private ensureLatest(): void {
    if (this.isSuperseded) throw new OfferNotLatestError();
  }

  private ensureStatus(from: QuotationStatus, to: QuotationStatus): void {
    if (this.props.status !== from) throw new OfferTransitionError(this.props.status, to);
  }
}
