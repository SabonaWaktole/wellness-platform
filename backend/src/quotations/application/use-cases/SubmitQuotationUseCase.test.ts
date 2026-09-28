import { SubmitQuotationUseCase } from './SubmitQuotationUseCase';
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

describe('SubmitQuotationUseCase', () => {
  let useCase: SubmitQuotationUseCase;
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

    // Sufficient stock by default — tests that care about the shortfall
    // override this explicitly, so every other test isn't required to know
    // about a check that is incidental to what it verifies.
    lineItemRepo.findByQuotationId.mockResolvedValue([
      QuotationLineItem.create({ id: 'li1', tenantId: 'tenant-1', quotationId: 'q1', productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10 }),
    ]);
    stockLevelRepo.findByProductAndWarehouse.mockResolvedValue(
      StockLevel.create({ id: 'sl1', tenantId: 'tenant-1', productId: 'p1', productTenantId: 'tenant-1', warehouseId: 'w1', warehouseTenantId: 'tenant-1', quantity: 10 })
    );

    useCase = new SubmitQuotationUseCase(writeTx, userRepo, lineItemRepo, stockLevelRepo);
  });

  function makeQuotation(status: QuotationStatus, createdByUserId: string): Quotation {
    const li = QuotationLineItem.create({
      id: 'li1', tenantId: 'tenant-1', quotationId: 'q1', productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10
    });
    return Quotation.create({
      id: 'q1', tenantId: 'tenant-1', clientId: 'c1', createdByUserId, lineItems: [li], status
    });
  }

  it('should submit to PendingApproval when approval is required', async () => {
    const quotation = makeQuotation(QuotationStatus.Draft, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      quotationId: 'q1',
      actingUserId: 'user-1',
      access: salesUser({ userId: 'user-1' }),
      requiresQuotationApproval: true
    });

    expect(result.quotation.status).toBe(QuotationStatus.PendingApproval);
    expect(result.quotation.sentAt).toBeNull();
    expect(quotationRepo.save).toHaveBeenCalledTimes(1);
    expect(historyRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should submit to Sent when approval NOT required and set sentAt', async () => {
    const quotation = makeQuotation(QuotationStatus.Draft, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      quotationId: 'q1',
      actingUserId: 'user-1',
      access: salesUser({ userId: 'user-1' }),
      requiresQuotationApproval: false
    });

    expect(result.quotation.status).toBe(QuotationStatus.Sent);
    expect(result.quotation.sentAt).toBeInstanceOf(Date);
  });

  it('should reject if not in Draft status', async () => {
    const quotation = makeQuotation(QuotationStatus.Sent, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' }), requiresQuotationApproval: true
    })).rejects.toThrow('Invalid state transition');
  });

  it('should reject if Staff tries to submit another Staffs quotation', async () => {
    const quotation = makeQuotation(QuotationStatus.Draft, 'user-2');
    quotationRepo.findById.mockResolvedValue(quotation);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' }), requiresQuotationApproval: true
    })).rejects.toThrow(PermissionDeniedError);
  });

  it('should allow Business Owner to submit any quotation', async () => {
    const quotation = makeQuotation(QuotationStatus.Draft, 'user-2');
    quotationRepo.findById.mockResolvedValue(quotation);

    const result = await useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'owner-1', access: administrator({ userId: 'owner-1' }), requiresQuotationApproval: true
    });

    expect(result.quotation.status).toBe(QuotationStatus.PendingApproval);
  });

  it('should refuse to send when a line item exceeds on-hand stock, and never mint a share token', async () => {
    const quotation = makeQuotation(QuotationStatus.Draft, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);
    stockLevelRepo.findByProductAndWarehouse.mockResolvedValue(
      StockLevel.create({ id: 'sl1', tenantId: 'tenant-1', productId: 'p1', productTenantId: 'tenant-1', warehouseId: 'w1', warehouseTenantId: 'tenant-1', quantity: 0 })
    );

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' }), requiresQuotationApproval: false
    })).rejects.toThrow('Insufficient stock for product p1 at warehouse w1');

    expect(quotationRepo.save).not.toHaveBeenCalled();
    expect(quotation.shareToken).toBeNull();
  });

  it('does NOT check stock when approval holds the quotation at PendingApproval', async () => {
    const quotation = makeQuotation(QuotationStatus.Draft, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);

    await useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' }), requiresQuotationApproval: true
    });

    // Stock can move before an owner approves it — that check belongs to
    // ApproveQuotationUseCase, not this route.
    expect(stockLevelRepo.findByProductAndWarehouse).not.toHaveBeenCalled();
  });
});
