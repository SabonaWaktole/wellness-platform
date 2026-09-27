import { ReturnQuotationToDraftUseCase } from './ReturnQuotationToDraftUseCase';
import { IQuotationRepository } from '../../domain/IQuotationRepository';
import { IQuotationStatusHistoryRepository } from '../../domain/IQuotationStatusHistoryRepository';
import { Quotation, QuotationStatus } from '../../domain/Quotation';
import { QuotationLineItem } from '../../domain/QuotationLineItem';
import { makeQuotationWriteHarness } from '../../../../tests/support/fakeQuotationWriteTransaction';
import { administrator, salesUser } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('ReturnQuotationToDraftUseCase', () => {
  let useCase: ReturnQuotationToDraftUseCase;
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

    useCase = new ReturnQuotationToDraftUseCase(writeTx, userRepo);
  });

  function makeQuotation(status: QuotationStatus): Quotation {
    const li = QuotationLineItem.create({
      id: 'li1', tenantId: 'tenant-1', quotationId: 'q1', productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10
    });
    return Quotation.create({
      id: 'q1', tenantId: 'tenant-1', clientId: 'c1', createdByUserId: 'user-1', lineItems: [li], status
    });
  }

  it('should return PendingApproval to Draft', async () => {
    const quotation = makeQuotation(QuotationStatus.PendingApproval);
    quotationRepo.findById.mockResolvedValue(quotation);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      quotationId: 'q1',
      actingUserId: 'owner-1',
      access: administrator({ userId: 'owner-1' }),
      reason: 'Needs adjustment'
    });

    expect(result.quotation.status).toBe(QuotationStatus.Draft);
    expect(quotationRepo.save).toHaveBeenCalledTimes(1);
    
    // Check history note
    const historySaveCall = historyRepo.save.mock.calls[0][0];
    expect(historySaveCall.note).toBe('Needs adjustment');
  });

  it('should reject STAFF role', async () => {
    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' })
    })).rejects.toThrow(PermissionDeniedError);
  });

  it('should reject if not in PendingApproval status', async () => {
    const quotation = makeQuotation(QuotationStatus.Sent);
    quotationRepo.findById.mockResolvedValue(quotation);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'owner-1', access: administrator({ userId: 'owner-1' })
    })).rejects.toThrow('Invalid state transition');
  });

  it('should work without reason (note is null)', async () => {
    const quotation = makeQuotation(QuotationStatus.PendingApproval);
    quotationRepo.findById.mockResolvedValue(quotation);

    await useCase.execute({
      tenantId: 'tenant-1',
      quotationId: 'q1',
      actingUserId: 'owner-1',
      access: administrator({ userId: 'owner-1' })
    });

    const historySaveCall = historyRepo.save.mock.calls[0][0];
    expect(historySaveCall.note).toBeNull();
  });
});
