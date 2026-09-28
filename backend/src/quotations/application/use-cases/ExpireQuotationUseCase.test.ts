import { ExpireQuotationUseCase } from './ExpireQuotationUseCase';
import { IQuotationRepository } from '../../domain/IQuotationRepository';
import { IQuotationStatusHistoryRepository } from '../../domain/IQuotationStatusHistoryRepository';
import { Quotation, QuotationStatus } from '../../domain/Quotation';
import { QuotationLineItem } from '../../domain/QuotationLineItem';
import { makeQuotationWriteHarness } from '../../../../tests/support/fakeQuotationWriteTransaction';
import { administrator, salesUser } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('ExpireQuotationUseCase', () => {
  let useCase: ExpireQuotationUseCase;
  let quotationRepo: jest.Mocked<IQuotationRepository>;
  let historyRepo: jest.Mocked<IQuotationStatusHistoryRepository>;
  let writeTx: ReturnType<typeof makeQuotationWriteHarness>['writeTx'];
  let userRepo: ReturnType<typeof makeQuotationWriteHarness>['userRepo'];

  beforeEach(() => {
    const harness = makeQuotationWriteHarness();
    quotationRepo = harness.quotationRepo;
    historyRepo = harness.historyRepo;
    writeTx = harness.writeTx;
    userRepo = harness.userRepo;

    useCase = new ExpireQuotationUseCase(writeTx, userRepo);
  });

  function makeQuotation(status: QuotationStatus, createdByUserId: string): Quotation {
    const li = QuotationLineItem.create({
      id: 'li1', tenantId: 'tenant-1', quotationId: 'q1', productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10
    });
    return Quotation.create({
      id: 'q1', tenantId: 'tenant-1', clientId: 'c1', createdByUserId, lineItems: [li], status
    });
  }

  it('should expire quotation and write history', async () => {
    const quotation = makeQuotation(QuotationStatus.Sent, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      quotationId: 'q1',
      actingUserId: 'user-1',
      access: salesUser({ userId: 'user-1' })
    });

    expect(result.quotation.status).toBe(QuotationStatus.Expired);
    expect(quotationRepo.save).toHaveBeenCalledTimes(1);
    expect(historyRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should prevent Staff from expiring another Staffs quotation', async () => {
    const quotation = makeQuotation(QuotationStatus.Sent, 'user-2');
    quotationRepo.findById.mockResolvedValue(quotation);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' })
    })).rejects.toThrow(PermissionDeniedError);
  });

  it('should allow Business Owner to expire any quotation', async () => {
    const quotation = makeQuotation(QuotationStatus.Sent, 'user-2');
    quotationRepo.findById.mockResolvedValue(quotation);

    const result = await useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'owner-1', access: administrator({ userId: 'owner-1' })
    });

    expect(result.quotation.status).toBe(QuotationStatus.Expired);
  });

  it('should reject if not in Sent status', async () => {
    const quotation = makeQuotation(QuotationStatus.PendingApproval, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'owner-1', access: administrator({ userId: 'owner-1' })
    })).rejects.toThrow('Invalid state transition');
  });
});
