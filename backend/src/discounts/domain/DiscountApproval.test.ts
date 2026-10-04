import { Money } from '../../pricing/domain/Money';
import { Percent } from '../../pricing/domain/Percent';
import { DiscountApproval } from './DiscountApproval';
import { SelfApprovalError } from './errors';

const props = () => ({
  id: 'approval-1',
  tenantId: 'tenant-1',
  quotationId: 'offer-1',
  requestedByUserId: 'sales-A',
  requestedPercent: Percent.of('15.00'),
  listPriceAtRequest: Money.of('49.40'),
  reason: 'Loyal customer',
  now: new Date('2026-10-01T10:00:00Z'),
});

describe('DiscountApproval FR-DSC-06, FR-DSC-09', () => {
  it('FR-DSC-09 self-approval is refused', () => {
    const approval = DiscountApproval.request(props());
    expect(() =>
      approval.approve({ decidedByUserId: 'sales-A', approvedPercent: Percent.of('12.00'), comment: null, now: new Date() })
    ).toThrow(SelfApprovalError);
  });

  it('FR-DSC-06 approving a lower percent than requested is allowed', () => {
    const approval = DiscountApproval.request(props());
    approval.approve({ decidedByUserId: 'manager-1', approvedPercent: Percent.of('12.00'), comment: null, now: new Date() });
    expect(approval.status).toBe('APPROVED');
    expect(approval.approvedPercent?.toString()).toBe('12.00');
  });

  it('FR-DSC-06 approving above the requested percent is refused', () => {
    const approval = DiscountApproval.request(props());
    expect(() =>
      approval.approve({ decidedByUserId: 'manager-1', approvedPercent: Percent.of('20.00'), comment: null, now: new Date() })
    ).toThrow();
  });
});

describe('DiscountApproval FR-PRC-09 manual price', () => {
  const base = () => ({
    id: 'approval-2',
    tenantId: 'tenant-1',
    quotationId: 'offer-1',
    requestedByUserId: 'sales-A',
    reason: 'Large site, priced by hand',
    now: new Date('2026-10-01T10:00:00Z'),
  });

  it('FR-PRC-09 a proposed manual price waits, and covers only the price approved', () => {
    const approval = DiscountApproval.requestManualPrice({ ...base(), requestedMonthlyPrice: Money.of('300.00') });
    expect(approval.status).toBe('PENDING');
    expect(approval.coversManualPrice(Money.of('300.00'))).toBe(false);
    approval.approve({ decidedByUserId: 'manager-1', approvedMonthlyPrice: Money.of('320.00'), comment: null, now: new Date() });
    expect(approval.coversManualPrice(Money.of('320.00'))).toBe(true);
    expect(approval.coversManualPrice(Money.of('300.00'))).toBe(false);
    expect(approval.approvedDiscount).toBeNull();
  });

  it('FR-PRC-09 an approver sets the price directly, already approved', () => {
    const approval = DiscountApproval.setManualPrice({ ...base(), requestedByUserId: 'manager-1', monthlyPrice: Money.of('300.00') });
    expect(approval.status).toBe('APPROVED');
    expect(approval.coversManualPrice(Money.of('300.00'))).toBe(true);
  });

  it('FR-PRC-09 a manual price needs a reason and must be more than 0', () => {
    expect(() => DiscountApproval.requestManualPrice({ ...base(), reason: ' ', requestedMonthlyPrice: Money.of('300.00') })).toThrow();
    expect(() => DiscountApproval.requestManualPrice({ ...base(), requestedMonthlyPrice: Money.zero() })).toThrow();
  });

  it('FR-DSC-09 a manual price cannot be approved by the one who proposed it', () => {
    const approval = DiscountApproval.requestManualPrice({ ...base(), requestedMonthlyPrice: Money.of('300.00') });
    expect(() => approval.approve({ decidedByUserId: 'sales-A', comment: null, now: new Date() })).toThrow(SelfApprovalError);
  });
});

describe('DiscountApproval FR-DSC-08 what an approval covers', () => {
  it('FR-DSC-08 only an approved discount is weighed by the policy', () => {
    const approval = DiscountApproval.request(props());
    expect(approval.approvedDiscount).toBeNull();
    approval.approve({ decidedByUserId: 'manager-1', approvedPercent: Percent.of('12.00'), comment: null, now: new Date() });
    expect(approval.approvedDiscount?.approvedPercent.toString()).toBe('12.00');
    expect(approval.approvedDiscount?.listPriceAtRequest.toString()).toBe('49.40');
  });
});
