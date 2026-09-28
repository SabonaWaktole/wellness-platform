import { MarkQuotationAcceptedUseCase } from './MarkQuotationAcceptedUseCase';
import { IQuotationRepository } from '../../domain/IQuotationRepository';
import { IQuotationLineItemRepository } from '../../domain/IQuotationLineItemRepository';
import { IQuotationStatusHistoryRepository } from '../../domain/IQuotationStatusHistoryRepository';
import { IStockLevelRepository, IStockMovementRepository, IStockTransactionManager } from '../../../inventory/domain/repositories';
import { Quotation, QuotationStatus } from '../../domain/Quotation';
import { QuotationLineItem } from '../../domain/QuotationLineItem';
import { StockLevel } from '../../../inventory/domain/StockLevel';
import { StockMovementType } from '../../../inventory/domain/StockMovement';
import { makeQuotationWriteHarness } from '../../../../tests/support/fakeQuotationWriteTransaction';
import { administrator, salesUser, scopeResolver } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('MarkQuotationAcceptedUseCase', () => {
  let useCase: MarkQuotationAcceptedUseCase;
  let quotationRepo: jest.Mocked<IQuotationRepository>;
  let lineItemRepo: jest.Mocked<IQuotationLineItemRepository>;
  let historyRepo: jest.Mocked<IQuotationStatusHistoryRepository>;
  let writeTx: ReturnType<typeof makeQuotationWriteHarness>['writeTx'];
  let userRepo: ReturnType<typeof makeQuotationWriteHarness>['userRepo'];
  let stockLevelRepo: jest.Mocked<IStockLevelRepository>;
  let stockMovementRepo: jest.Mocked<IStockMovementRepository>;
  let transactionManager: jest.Mocked<IStockTransactionManager>;
  let transactionStockLevelRepo: jest.Mocked<IStockLevelRepository>;
  let transactionStockMovementRepo: jest.Mocked<IStockMovementRepository>;

  beforeEach(() => {
    const harness = makeQuotationWriteHarness();
    quotationRepo = harness.quotationRepo;
    historyRepo = harness.historyRepo;
    writeTx = harness.writeTx;
    userRepo = harness.userRepo;
    lineItemRepo = { findByQuotationId: jest.fn(), save: jest.fn(), saveMany: jest.fn(), deleteManyByQuotationId: jest.fn() };
    
    stockLevelRepo = { findById: jest.fn(), findByProductAndWarehouse: jest.fn(), findByProductId: jest.fn(), save: jest.fn(), countByWarehouseId: jest.fn() };
    stockMovementRepo = { save: jest.fn() };
    
    transactionStockLevelRepo = { findById: jest.fn(), findByProductAndWarehouse: jest.fn(), findByProductId: jest.fn(), save: jest.fn(), countByWarehouseId: jest.fn() };
    transactionStockMovementRepo = { save: jest.fn() };

    transactionManager = {
      executeTransaction: jest.fn().mockImplementation(async (work) => {
        return work({
          stockLevelRepository: transactionStockLevelRepo,
          stockMovementRepository: transactionStockMovementRepo
        });
      }),
    };

    useCase = new MarkQuotationAcceptedUseCase(quotationRepo, lineItemRepo, historyRepo, stockLevelRepo, transactionManager, writeTx, userRepo, scopeResolver());
  });

  function makeQuotation(status: QuotationStatus, createdByUserId: string): Quotation {
    return Quotation.create({
      id: 'q1', tenantId: 'tenant-1', clientId: 'c1', createdByUserId, clientAssignedUserId: createdByUserId, 
      lineItems: [
        QuotationLineItem.create({
          id: 'li1', tenantId: 'tenant-1', quotationId: 'q1', productId: 'p1', warehouseId: 'w1', quantity: 5, unitPrice: 10
        }),
        QuotationLineItem.create({
          id: 'li2', tenantId: 'tenant-1', quotationId: 'q1', productId: 'p2', warehouseId: 'w2', quantity: 3, unitPrice: 20
        })
      ], 
      status
    });
  }

  it('should accept quotation, deduct stock in transaction, and record ADJUSTMENT movements', async () => {
    const quotation = makeQuotation(QuotationStatus.Sent, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);
    lineItemRepo.findByQuotationId.mockResolvedValue(quotation.lineItems);

    const stock1 = StockLevel.create({
      id: 'sl1', tenantId: 'tenant-1', productId: 'p1', productTenantId: 'tenant-1', warehouseId: 'w1', warehouseTenantId: 'tenant-1', quantity: 10
    });
    const stock2 = StockLevel.create({
      id: 'sl2', tenantId: 'tenant-1', productId: 'p2', productTenantId: 'tenant-1', warehouseId: 'w2', warehouseTenantId: 'tenant-1', quantity: 5
    });
    
    stockLevelRepo.findByProductAndWarehouse
      .mockResolvedValueOnce(stock1)
      .mockResolvedValueOnce(stock2);

    transactionStockLevelRepo.findByProductAndWarehouse
      .mockResolvedValueOnce(stock1)
      .mockResolvedValueOnce(stock2);

    const result = await useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'owner-1', access: administrator({ userId: 'owner-1' })
    });

    expect(result.quotation.status).toBe(QuotationStatus.Accepted);
    expect(result.quotation.respondedAt).toBeInstanceOf(Date);
    
    // Check Pre-validation lookup
    expect(stockLevelRepo.findByProductAndWarehouse).toHaveBeenCalledTimes(2);

    // Transaction execution check
    expect(transactionManager.executeTransaction).toHaveBeenCalledTimes(1);
    expect(transactionStockLevelRepo.findByProductAndWarehouse).toHaveBeenCalledTimes(2);
    expect(transactionStockLevelRepo.save).toHaveBeenCalledTimes(2);
    
    // Check deductions
    expect(stock1.quantity).toBe(5); // 10 - 5
    expect(stock2.quantity).toBe(2); // 5 - 3

    // Check movements logged
    expect(transactionStockMovementRepo.save).toHaveBeenCalledTimes(2);
    const movement1 = transactionStockMovementRepo.save.mock.calls[0][0];
    expect(movement1.type).toBe(StockMovementType.ADJUSTMENT);
    expect(movement1.quantity).toBe(-5);
    expect(movement1.reason).toContain('Quotation q1 accepted');
    
    // Check saves
    expect(quotationRepo.save).toHaveBeenCalledTimes(1);
    expect(historyRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should reject if any line item has insufficient stock, ALL StockLevels unchanged', async () => {
    const quotation = makeQuotation(QuotationStatus.Sent, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);
    lineItemRepo.findByQuotationId.mockResolvedValue(quotation.lineItems);

    const stock1 = StockLevel.create({
      id: 'sl1', tenantId: 'tenant-1', productId: 'p1', productTenantId: 'tenant-1', warehouseId: 'w1', warehouseTenantId: 'tenant-1', quantity: 10
    });
    const stock2 = StockLevel.create({
      id: 'sl2', tenantId: 'tenant-1', productId: 'p2', productTenantId: 'tenant-1', warehouseId: 'w2', warehouseTenantId: 'tenant-1', quantity: 2 // Needs 3, only has 2
    });
    
    stockLevelRepo.findByProductAndWarehouse
      .mockResolvedValueOnce(stock1)
      .mockResolvedValueOnce(stock2);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'owner-1', access: administrator({ userId: 'owner-1' })
    })).rejects.toThrow('Insufficient stock for product p2 at warehouse w2');

    // ALL quantities must remain completely unchanged
    expect(stock1.quantity).toBe(10);
    expect(stock2.quantity).toBe(2);

    // Transaction should NOT have been called
    expect(transactionManager.executeTransaction).not.toHaveBeenCalled();
    expect(transactionStockLevelRepo.save).not.toHaveBeenCalled();
    expect(transactionStockMovementRepo.save).not.toHaveBeenCalled();
    expect(quotationRepo.save).not.toHaveBeenCalled();
  });

  it('should reject if stock level not found for a line item', async () => {
    const quotation = makeQuotation(QuotationStatus.Sent, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);
    lineItemRepo.findByQuotationId.mockResolvedValue(quotation.lineItems);

    stockLevelRepo.findByProductAndWarehouse.mockResolvedValueOnce(null);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'owner-1', access: administrator({ userId: 'owner-1' })
    })).rejects.toThrow('Stock level not found for product p1 at warehouse w1');
  });

  it('should reject if not in Sent status', async () => {
    const quotation = makeQuotation(QuotationStatus.PendingApproval, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);
    lineItemRepo.findByQuotationId.mockResolvedValue(quotation.lineItems);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'owner-1', access: administrator({ userId: 'owner-1' })
    })).rejects.toThrow('Invalid state transition');
  });

  it('should reject if Staff tries to accept another Staffs quotation', async () => {
    const quotation = makeQuotation(QuotationStatus.Sent, 'user-2'); // created by user-2
    quotationRepo.findById.mockResolvedValue(quotation);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' })
    })).rejects.toThrow('Quotation not found');
  });

  it('should allow Staff to accept their own quotation', async () => {
    const quotation = makeQuotation(QuotationStatus.Sent, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);
    lineItemRepo.findByQuotationId.mockResolvedValue(quotation.lineItems);

    const stock1 = StockLevel.create({
      id: 'sl1', tenantId: 'tenant-1', productId: 'p1', productTenantId: 'tenant-1', warehouseId: 'w1', warehouseTenantId: 'tenant-1', quantity: 10
    });
    const stock2 = StockLevel.create({
      id: 'sl2', tenantId: 'tenant-1', productId: 'p2', productTenantId: 'tenant-1', warehouseId: 'w2', warehouseTenantId: 'tenant-1', quantity: 10
    });
    
    stockLevelRepo.findByProductAndWarehouse
      .mockResolvedValueOnce(stock1)
      .mockResolvedValueOnce(stock2);

    transactionStockLevelRepo.findByProductAndWarehouse
      .mockResolvedValueOnce(stock1)
      .mockResolvedValueOnce(stock2);

    const result = await useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' })
    });

    expect(result.quotation.status).toBe(QuotationStatus.Accepted);
  });

  it('should attribute the stock movement to the quotation owner when accepted by the client (null actingUserId)', async () => {
    const quotation = makeQuotation(QuotationStatus.Sent, 'owner-1');
    quotationRepo.findById.mockResolvedValue(quotation);
    lineItemRepo.findByQuotationId.mockResolvedValue(quotation.lineItems);

    const stock1 = StockLevel.create({
      id: 'sl1', tenantId: 'tenant-1', productId: 'p1', productTenantId: 'tenant-1', warehouseId: 'w1', warehouseTenantId: 'tenant-1', quantity: 10
    });
    const stock2 = StockLevel.create({
      id: 'sl2', tenantId: 'tenant-1', productId: 'p2', productTenantId: 'tenant-1', warehouseId: 'w2', warehouseTenantId: 'tenant-1', quantity: 10
    });

    stockLevelRepo.findByProductAndWarehouse
      .mockResolvedValueOnce(stock1)
      .mockResolvedValueOnce(stock2);

    transactionStockLevelRepo.findByProductAndWarehouse
      .mockResolvedValueOnce(stock1)
      .mockResolvedValueOnce(stock2);

    const result = await useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: null, access: null
    });

    expect(result.quotation.status).toBe(QuotationStatus.Accepted);
    const savedHistory = historyRepo.save.mock.calls[0][0];
    expect(savedHistory.changedByUserId).toBeNull();

    const movement1 = transactionStockMovementRepo.save.mock.calls[0][0];
    // No user initiated this, but StockMovement.createdBy has a not-null FK —
    // it falls back to whoever owns the quotation.
    expect(movement1.createdBy).toBe('owner-1');
  });
});
