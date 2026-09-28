import { ApproveQuotationUseCase } from './ApproveQuotationUseCase';
import { IQuotationRepository } from '../../domain/IQuotationRepository';
import { IQuotationStatusHistoryRepository } from '../../domain/IQuotationStatusHistoryRepository';
import { IQuotationLineItemRepository } from '../../domain/IQuotationLineItemRepository';
import { IStockLevelRepository } from '../../../inventory/domain/repositories';
import { Quotation, QuotationStatus } from '../../domain/Quotation';
import { QuotationLineItem } from '../../domain/QuotationLineItem';
import { StockLevel } from '../../../inventory/domain/StockLevel';
import { makeQuotationWriteHarness } from '../../../../tests/support/fakeQuotationWriteTransaction';
import { administrator, salesUser } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('ApproveQuotationUseCase', () => {
  let useCase: ApproveQuotationUseCase;
  let quotationRepo: jest.Mocked<IQuotationRepository>;
  let historyRepo: jest.Mocked<IQuotationStatusHistoryRepository>;
  let writeTx: ReturnType<typeof makeQuotationWriteHarness>['writeTx'];
  let userRepo: ReturnType<typeof makeQuotationWriteHarness>['userRepo'];
  let lineItemRepo: jest.Mocked<IQuotationLineItemRepository>;
  let stockLevelRepo: jest.Mocked<IStockLevelRepository>;

  beforeEach(() => {
    const harness = makeQuotationWriteHarness();
    quotationRepo = harness.quotationRepo;
    historyRepo = harness.historyRepo;
    writeTx = harness.writeTx;
    userRepo = harness.userRepo;
    lineItemRepo = { findByQuotationId: jest.fn(), save: jest.fn(), saveMany: jest.fn(), deleteManyByQuotationId: jest.fn() };
    stockLevelRepo = { findById: jest.fn(), findByProductAndWarehouse: jest.fn(), findByProductId: jest.fn(), save: jest.fn(), countByWarehouseId: jest.fn() };

    lineItemRepo.findByQuotationId.mockResolvedValue([
      QuotationLineItem.create({ id: 'li1', tenantId: 'tenant-1', quotationId: 'q1', productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10 }),
    ]);
    stockLevelRepo.findByProductAndWarehouse.mockResolvedValue(
      StockLevel.create({ id: 'sl1', tenantId: 'tenant-1', productId: 'p1', productTenantId: 'tenant-1', warehouseId: 'w1', warehouseTenantId: 'tenant-1', quantity: 10 })
    );

    useCase = new ApproveQuotationUseCase(writeTx, userRepo, lineItemRepo, stockLevelRepo);
  });

  function makeQuotation(status: QuotationStatus): Quotation {
    const li = QuotationLineItem.create({
      id: 'li1', tenantId: 'tenant-1', quotationId: 'q1', productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10
    });
    return Quotation.create({
      id: 'q1', tenantId: 'tenant-1', clientId: 'c1', createdByUserId: 'user-1', lineItems: [li], status
    });
  }

  it('should approve and transition to Sent', async () => {
    const quotation = makeQuotation(QuotationStatus.PendingApproval);
    quotationRepo.findById.mockResolvedValue(quotation);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      quotationId: 'q1',
      actingUserId: 'owner-1',
      access: administrator({ userId: 'owner-1' })
    });

    expect(result.quotation.status).toBe(QuotationStatus.Sent);
    expect(result.quotation.sentAt).toBeInstanceOf(Date);
    expect(quotationRepo.save).toHaveBeenCalledTimes(1);
    expect(historyRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should reject STAFF role', async () => {
    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' })
    })).rejects.toThrow(PermissionDeniedError);
  });

  it('should reject if quotation not found', async () => {
    quotationRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'owner-1', access: administrator({ userId: 'owner-1' })
    })).rejects.toThrow('Quotation not found');
  });

  it('should reject if not in PendingApproval status', async () => {
    const quotation = makeQuotation(QuotationStatus.Draft);
    quotationRepo.findById.mockResolvedValue(quotation);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'owner-1', access: administrator({ userId: 'owner-1' })
    })).rejects.toThrow('Invalid state transition');
  });

  it('should refuse to approve when a line item exceeds on-hand stock, and never mint a share token', async () => {
    const quotation = makeQuotation(QuotationStatus.PendingApproval);
    quotationRepo.findById.mockResolvedValue(quotation);
    stockLevelRepo.findByProductAndWarehouse.mockResolvedValue(
      StockLevel.create({ id: 'sl1', tenantId: 'tenant-1', productId: 'p1', productTenantId: 'tenant-1', warehouseId: 'w1', warehouseTenantId: 'tenant-1', quantity: 0 })
    );

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'owner-1', access: administrator({ userId: 'owner-1' })
    })).rejects.toThrow('Insufficient stock for product p1 at warehouse w1');

    expect(quotationRepo.save).not.toHaveBeenCalled();
    expect(quotation.shareToken).toBeNull();
  });
});
