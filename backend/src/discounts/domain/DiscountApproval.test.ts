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
