import { MarkQuotationRejectedUseCase } from './MarkQuotationRejectedUseCase';
import { IQuotationRepository } from '../../domain/IQuotationRepository';
import { IQuotationStatusHistoryRepository } from '../../domain/IQuotationStatusHistoryRepository';
import { Quotation, QuotationStatus } from '../../domain/Quotation';
import { QuotationLineItem } from '../../domain/QuotationLineItem';
import { makeQuotationWriteHarness } from '../../../../tests/support/fakeQuotationWriteTransaction';
import { administrator, salesUser } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('MarkQuotationRejectedUseCase', () => {
  let useCase: MarkQuotationRejectedUseCase;
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

    useCase = new MarkQuotationRejectedUseCase(writeTx, userRepo);
  });

  function makeQuotation(status: QuotationStatus, createdByUserId: string): Quotation {
    const li = QuotationLineItem.create({
      id: 'li1', tenantId: 'tenant-1', quotationId: 'q1', productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10
    });
    return Quotation.create({
      id: 'q1', tenantId: 'tenant-1', clientId: 'c1', createdByUserId, lineItems: [li], status
    });
  }

  it('should reject quotation, set respondedAt, and write history (NO stock impact)', async () => {
    const quotation = makeQuotation(QuotationStatus.Sent, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      quotationId: 'q1',
      actingUserId: 'user-1',
      access: salesUser({ userId: 'user-1' })
    });

    expect(result.quotation.status).toBe(QuotationStatus.Rejected);
    expect(result.quotation.respondedAt).toBeInstanceOf(Date);
    expect(quotationRepo.save).toHaveBeenCalledTimes(1);
    expect(historyRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should prevent Staff from rejecting another Staffs quotation', async () => {
    const quotation = makeQuotation(QuotationStatus.Sent, 'user-2');
    quotationRepo.findById.mockResolvedValue(quotation);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' })
    })).rejects.toThrow(PermissionDeniedError);
  });

  it('should allow Business Owner to reject any quotation', async () => {
    const quotation = makeQuotation(QuotationStatus.Sent, 'user-2');
    quotationRepo.findById.mockResolvedValue(quotation);

    const result = await useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'owner-1', access: administrator({ userId: 'owner-1' })
    });

    expect(result.quotation.status).toBe(QuotationStatus.Rejected);
  });

  it('should reject if not in Sent status', async () => {
    const quotation = makeQuotation(QuotationStatus.PendingApproval, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'owner-1', access: administrator({ userId: 'owner-1' })
    })).rejects.toThrow('Invalid state transition');
  });

  it('should accept a null actingUserId — the client, via the public quotation link', async () => {
    const quotation = makeQuotation(QuotationStatus.Sent, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);

    const result = await useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: null, access: null,
      note: 'Please requote with a larger reception counter'
    });

    expect(result.quotation.status).toBe(QuotationStatus.Rejected);
    const savedHistory = historyRepo.save.mock.calls[0][0];
    expect(savedHistory.changedByUserId).toBeNull();
    expect(savedHistory.note).toBe('Please requote with a larger reception counter');
  });
});
