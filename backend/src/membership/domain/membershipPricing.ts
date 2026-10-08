import { PricingDecimal } from '../../pricing/domain/decimal';
import { Money } from '../../pricing/domain/Money';
import { Percent } from '../../pricing/domain/Percent';
import type { MemberStatus } from './memberValidity';
import type { PaymentKind } from './termDates';
import { type Tier, tierRank } from './Tier';

/** fee × (1 − discount), rounded half up once, on the result (D6). */
export const price = (fee: Money, discount: Percent): Money =>
  Money.of(new PricingDecimal(fee.toString()).times(new PricingDecimal(1).minus(discount.fraction)));

/** The new price minus the current one, same discount, never below 0.00 (FR-MPAY-03). */
export const upgradePrice = (newFee: Money, currentFee: Money, discount: Percent): Money => {
  const difference = price(newFee, discount).subtract(price(currentFee, discount));
  return difference.isNegative() ? Money.zero() : difference;
};

/** FR-FAM-04: only an Active principal who is Silver, Gold or VIP on the payment date. */
export const familyDiscount = (principal: { status: MemberStatus; effectiveTier: Tier } | null, percent: Percent): Percent =>
  principal !== null && principal.status === 'ACTIVE' && tierRank(principal.effectiveTier) >= tierRank('SILVER')
    ? percent
    : Percent.zero();

export interface PurchaseContext {
  status: MemberStatus;
  /** The effective tier on the payment date. */
  effectiveTier: Tier;
  /** The tier of the paid term valid today or within the grace days, if any. */
  paidTier: Tier | null;
  hasSponsoredTerm: boolean;
  kind: PaymentKind;
  targetTier: Tier;
}

export type PurchaseRefusal =
  | 'MEMBER_NOT_ACTIVE'
  | 'TIER_NOT_PURCHASABLE'
  | 'NOT_A_HIGHER_TIER'
  | 'PAID_TERM_RUNNING'
  | 'NOTHING_TO_RENEW'
  | 'NOTHING_TO_UPGRADE'
  | 'USE_UPGRADE';

export type PurchaseResult =
  | { allowed: true; warnings: Array<'SPONSORED_SILVER_OWN_TERM'> }
  | { allowed: false; reason: PurchaseRefusal };

const refuse = (reason: PurchaseRefusal): PurchaseResult => ({ allowed: false, reason });

/** The purchase rules of FR-MPAY-02..04 and plan D5. */
export function checkPurchase(ctx: PurchaseContext): PurchaseResult {
  if (ctx.status !== 'ACTIVE') return refuse('MEMBER_NOT_ACTIVE');
  if (ctx.targetTier !== 'SILVER' && ctx.targetTier !== 'GOLD') return refuse('TIER_NOT_PURCHASABLE');

  if (ctx.kind === 'RENEWAL') {
    return ctx.paidTier === ctx.targetTier ? { allowed: true, warnings: [] } : refuse('NOTHING_TO_RENEW');
  }

  if (ctx.kind === 'UPGRADE') {
    // Bronze to Gold is a New purchase at the full price (FR-MPAY-03): there is no paid tier to pay the difference to.
    if (ctx.effectiveTier === 'BRONZE') return refuse('NOTHING_TO_UPGRADE');
    return tierRank(ctx.targetTier) > tierRank(ctx.effectiveTier) ? { allowed: true, warnings: [] } : refuse('NOT_A_HIGHER_TIER');
  }

  if (ctx.paidTier !== null) return refuse('PAID_TERM_RUNNING');
  if (tierRank(ctx.targetTier) < tierRank(ctx.effectiveTier)) return refuse('NOT_A_HIGHER_TIER');
  // A member who already holds Silver pays the difference to Gold, not the full price again.
  if (tierRank(ctx.targetTier) > tierRank(ctx.effectiveTier) && ctx.effectiveTier !== 'BRONZE') return refuse('USE_UPGRADE');
  return {
    allowed: true,
    warnings: ctx.targetTier === ctx.effectiveTier && ctx.hasSponsoredTerm ? ['SPONSORED_SILVER_OWN_TERM'] : [],
  };
}
