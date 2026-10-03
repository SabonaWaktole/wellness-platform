import { Money } from '../../pricing/domain/Money';
import { Percent } from '../../pricing/domain/Percent';
import { OfferNotEditableError } from './offerErrors';
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
  /** NULL on a "Price on request" draft (FR-PRC-07). */
  amounts: OfferAmounts | null;
  services: OfferServiceLine[];
  /** Free text, such as special conditions (FR-OFR-03). */
  note: string | null;
}

export interface OfferProps extends OfferContent {
  id: string;
  tenantId: string;
  clientId: string;
  dealId: string;
  createdByUserId: string;
  status: QuotationStatus;
  language: OfferLanguage;
  createdAt: Date;
  updatedAt: Date;
}

export const OFFER_NOTE_MAX = 5000;

const cleanNote = (note: string | null): string | null => {
  const trimmed = note?.trim() ?? '';
  return trimmed === '' ? null : trimmed.slice(0, OFFER_NOTE_MAX);
};

/**
 * An offer: a quotation that belongs to a deal (FR-OFR-01). In this slice it
 * is only ever a draft, created and replaced from the pricing screen; Slice 9
 * adds its number, its document and its later statuses.
 */
export class Offer {
  private constructor(private props: OfferProps) {}

  static draft(input: {
    id: string;
    tenantId: string;
    clientId: string;
    dealId: string;
    createdByUserId: string;
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

  /** Saving the pricing screen again replaces the draft's content (FR-PRC-12). */
  replaceDraft(content: OfferContent, now: Date): void {
    if (this.props.status !== QuotationStatus.Draft) {
      throw new OfferNotEditableError('Only a draft offer can be changed.');
    }
    this.props = { ...this.props, ...content, note: cleanNote(content.note), updatedAt: now };
  }

  toProps(): OfferProps {
    return { ...this.props };
  }
}
