import { Percent } from '../../pricing/domain/Percent';
import { Money } from '../../pricing/domain/Money';
import { DiscountPolicy } from './DiscountPolicy';

/**
 * FR-DSC-08: an approval covers that offer version, list price and discount
 * only. Raising the discount or changing the list price voids it; lowering
 * the discount keeps it.
 */
describe('DiscountPolicy FR-DSC-08', () => {
  const cap = () => Percent.of('10.00');
  const money = (value: string) => Money.of(value);

  it('FR-DSC-08 within cap needs no approval', () => {
    expect(DiscountPolicy.evaluate(Percent.of('5.00'), cap(), null, money('49.40'))).toBe('WITHIN_CAP');
    expect(DiscountPolicy.evaluate(Percent.of('10.00'), cap(), null, money('49.40'))).toBe('WITHIN_CAP');
  });

  it('FR-DSC-08 above cap with no approval needs approval', () => {
    expect(DiscountPolicy.evaluate(Percent.of('15.00'), cap(), null, money('49.40'))).toBe('NEEDS_APPROVAL');
  });

  it('FR-DSC-08 approval covers the same list price at or below the approved percent', () => {
    const approval = { listPriceAtRequest: money('49.40'), approvedPercent: Percent.of('15.00') };
    expect(DiscountPolicy.evaluate(Percent.of('15.00'), cap(), approval, money('49.40'))).toBe('APPROVED_COVERS');
    expect(DiscountPolicy.evaluate(Percent.of('12.00'), cap(), approval, money('49.40'))).toBe('APPROVED_COVERS');
  });

  it('FR-DSC-08 raising the discount above the approved percent needs a new approval', () => {
    const approval = { listPriceAtRequest: money('49.40'), approvedPercent: Percent.of('12.00') };
    expect(DiscountPolicy.evaluate(Percent.of('15.00'), cap(), approval, money('49.40'))).toBe('NEEDS_APPROVAL');
  });

  it('FR-DSC-08 changing the list price voids the approval', () => {
    const approval = { listPriceAtRequest: money('49.40'), approvedPercent: Percent.of('15.00') };
    expect(DiscountPolicy.evaluate(Percent.of('12.00'), cap(), approval, money('55.00'))).toBe('NEEDS_APPROVAL');
  });
});
