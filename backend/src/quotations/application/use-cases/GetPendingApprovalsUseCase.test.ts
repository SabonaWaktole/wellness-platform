import { GetPendingApprovalsUseCase } from './GetPendingApprovalsUseCase';
import { IQuotationRepository } from '../../domain/IQuotationRepository';
import { Quotation, QuotationStatus } from '../../domain/Quotation';
import { QuotationLineItem } from '../../domain/QuotationLineItem';
import { administrator, salesUser } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('GetPendingApprovalsUseCase', () => {
  let useCase: GetPendingApprovalsUseCase;
  let quotationRepo: jest.Mocked<IQuotationRepository>;

  beforeEach(() => {
    quotationRepo = { findById: jest.fn(), findPendingApprovals: jest.fn(), search: jest.fn(), save: jest.fn() };
    useCase = new GetPendingApprovalsUseCase(quotationRepo);
  });

  function makeQuotation(): Quotation {
    const li = QuotationLineItem.create({ id: 'li1', tenantId: 'tenant-1', quotationId: 'q1', productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10 });
    return Quotation.create({
      id: 'q1', tenantId: 'tenant-1', clientId: 'c1', createdByUserId: 'user-1', lineItems: [li], status: QuotationStatus.PendingApproval
    });
  }

  it('should return pending approvals for Business Owner', async () => {
    const quotation = makeQuotation();
    quotationRepo.findPendingApprovals.mockResolvedValue([quotation]);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      access: administrator()
    });

    expect(quotationRepo.findPendingApprovals).toHaveBeenCalledWith('tenant-1');
    expect(result.quotations.length).toBe(1);
    expect(result.quotations[0].id).toBe('q1');
  });

  it('should reject STAFF role', async () => {
    await expect(useCase.execute({
      tenantId: 'tenant-1',
      access: salesUser()
    })).rejects.toThrow(PermissionDeniedError);
  });
});
