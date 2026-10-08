import { addDays, startOfDay } from '../../contracts/domain/calendarDay';
import { Money } from '../../pricing/domain/Money';
import { Percent } from '../../pricing/domain/Percent';
import { effectiveTierOn, validTermsOn, type MemberTermValue } from './MemberTerm';
import type { MemberStatus } from './memberValidity';
import { checkPurchase, familyDiscount, price, upgradePrice, type PurchaseRefusal } from './membershipPricing';
import { paidTermDates, type PaymentKind } from './termDates';
import type { Tier } from './Tier';

export interface QuoteTerm extends MemberTermValue {
  id: string;
}

export interface QuoteInput {
  status: MemberStatus;
  terms: readonly QuoteTerm[];
  sponsorValid: boolean;
  graceDays: number;
  /** The list fee and term length of Silver and Gold. */
  fees: Record<'SILVER' | 'GOLD', Money>;
  termMonths: Record<'SILVER' | 'GOLD', number>;
  familyDiscountPercent: Percent;
  /** Null until the family group exists (Slice 6) or when the member has no principal. */
  principal: { status: MemberStatus; effectiveTier: Tier } | null;
  kind: PaymentKind;
  targetTier: Tier;
  /** The date received, a workspace day. */
  receivedOn: Date;
}

/** A term the payment ends the day before it starts, so a void can restore it (D3). */
export interface ClosedTerm {
  termId: string;
  originalEndsOn: Date;
  newEndsOn: Date;
}

export interface PaymentQuote {
  /** The kind that applies: a renewal outside the grace window is a New term. */
  kind: PaymentKind;
  fromTier: Tier;
  toTier: Tier;
  /** The list fee of the target tier, as the price list holds it. */
  listFee: Money;
  discountPercent: Percent;
  amount: Money;
  startsOn: Date;
  endsOn: Date;
  closes: ClosedTerm[];
  warnings: Array<'SPONSORED_SILVER_OWN_TERM'>;
}

export type QuoteResult = { allowed: true; quote: PaymentQuote } | { allowed: false; reason: PurchaseRefusal };

/**
 * The one price and term calculation of a membership payment (FR-MPAY-01..04,
 * D5, D6). The screen and the stored payment both come from here, so the number
 * the agent sees is the number saved. The effective tier, the paid term, the
 * discount and the dates are all read on the payment date.
 */
export function quotePayment(input: QuoteInput): QuoteResult {
  const { terms, graceDays, receivedOn, targetTier, kind } = input;
  const effectiveTier = effectiveTierOn(terms, input.sponsorValid, graceDays, receivedOn);
  const valid = validTermsOn(terms, input.sponsorValid, graceDays, receivedOn) as QuoteTerm[];
  const paidValid = valid.filter((t) => t.source === 'PAID');
  const paidTier = paidValid.length === 0 ? null : paidValid.reduce((a, b) => (b.endsOn! > a.endsOn! ? b : a)).tier;

  const check = checkPurchase({
    status: input.status,
    effectiveTier,
    paidTier,
    hasSponsoredTerm: valid.some((t) => t.source === 'SPONSORED'),
    kind,
    targetTier,
  });
  if (!check.allowed) return { allowed: false, reason: check.reason };

  const target = targetTier as 'SILVER' | 'GOLD';
  const discount = familyDiscount(input.principal, input.familyDiscountPercent);
  const listFee = input.fees[target];
  const amount =
    kind === 'UPGRADE'
      ? upgradePrice(listFee, input.fees[effectiveTier as 'SILVER' | 'GOLD'], discount)
      : price(listFee, discount);

  // A renewal continues the latest paid term of the tier, wherever it ends. An upgrade ends the paid term running now.
  const latest = (list: readonly QuoteTerm[]) => (list.length === 0 ? null : list.reduce((a, b) => (b.endsOn! > a.endsOn! ? b : a)).endsOn);
  const currentEnd =
    kind === 'RENEWAL' ? latest(terms.filter((t) => t.source === 'PAID' && t.tier === targetTier && t.endsOn !== null)) : latest(paidValid);
  const dates = paidTermDates({ kind, paymentDate: receivedOn, currentEnd, months: input.termMonths[target], graceDays });

  // An upgrade ends the paid term, and a purchase on a downgrade term ends that term (D5a), the day before it starts.
  // A term already past its end (inside the grace days) is left as it is: closing it would lengthen it.
  const closing = (t: QuoteTerm): ClosedTerm => ({ termId: t.id, originalEndsOn: t.endsOn!, newEndsOn: addDays(receivedOn, -1) });
  const stillRunning = (t: QuoteTerm) => t.endsOn !== null && startOfDay(t.endsOn) >= startOfDay(receivedOn);
  const closes: ClosedTerm[] = [];
  if (dates.kind === 'UPGRADE') closes.push(...paidValid.filter(stillRunning).map(closing));
  if (dates.kind !== 'RENEWAL') closes.push(...valid.filter((t) => t.source === 'DOWNGRADE' && stillRunning(t)).map(closing));

  return {
    allowed: true,
    quote: {
      kind: dates.kind,
      fromTier: effectiveTier,
      toTier: targetTier,
      listFee,
      discountPercent: discount,
      amount,
      startsOn: dates.startsOn,
      endsOn: dates.endsOn,
      closes,
      warnings: check.warnings,
    },
  };
}
