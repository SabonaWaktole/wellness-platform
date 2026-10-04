import { Money } from '../../pricing/domain/Money';
import { Percent } from '../../pricing/domain/Percent';

export type DiscountDecision = 'WITHIN_CAP' | 'NEEDS_APPROVAL' | 'APPROVED_COVERS';

export interface ApprovedDiscount {
  listPriceAtRequest: Money;
  approvedPercent: Percent;
}

/**
 * Whether a discount may be applied (FR-DSC-02, 04, 08).
 *
 * Within the cap needs nothing. Above the cap needs an approval that covers
 * this list price and this discount: the same list price as requested and a
 * discount at or below the approved percent. Lowering the discount keeps the
 * approval; raising it or changing the list price voids it.
 */
export const DiscountPolicy = {
  evaluate(discount: Percent, cap: Percent, approval: ApprovedDiscount | null, listPrice: Money): DiscountDecision {
    if (!discount.exceeds(cap)) return 'WITHIN_CAP';
    if (!approval) return 'NEEDS_APPROVAL';
    if (!approval.listPriceAtRequest.equals(listPrice)) return 'NEEDS_APPROVAL';
    if (discount.exceeds(approval.approvedPercent)) return 'NEEDS_APPROVAL';
    return 'APPROVED_COVERS';
  },
};
