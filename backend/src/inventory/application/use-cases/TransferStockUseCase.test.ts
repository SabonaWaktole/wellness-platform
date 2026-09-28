import { TransferStockUseCase } from './TransferStockUseCase';
import { IStockLevelRepository, IStockMovementRepository, IStockTransactionManager } from '../../domain/repositories';
import { StockLevel } from '../../domain/StockLevel';
import { NegativeStockError } from '../../domain/errors';
import { StockMovementType } from '../../domain/StockMovement';
import { reception, salesUser } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('TransferStockUseCase', () => {
  let useCase: TransferStockUseCase;
  let stockLevelRepo: jest.Mocked<IStockLevelRepository>;
  let stockMovementRepo: jest.Mocked<IStockMovementRepository>;
  let transactionManager: jest.Mocked<IStockTransactionManager>;
  let transactionStockLevelRepo: jest.Mocked<IStockLevelRepository>;
  let transactionStockMovementRepo: jest.Mocked<IStockMovementRepository>;

  beforeEach(() => {
    stockLevelRepo = {
      findById: jest.fn(),
      findByProductAndWarehouse: jest.fn(),
      findByProductId: jest.fn(),
      save: jest.fn(),
      countByWarehouseId: jest.fn(),
    };
    // These are the repos passed INTO the transaction callback
    transactionStockLevelRepo = {
      findById: jest.fn(),
      findByProductAndWarehouse: jest.fn(),
      findByProductId: jest.fn(),
      save: jest.fn(),
      countByWarehouseId: jest.fn(),
    };
    transactionStockMovementRepo = {
      save: jest.fn(),
    };

    transactionManager = {
      executeTransaction: jest.fn().mockImplementation(async (work) => {
        return work({
          stockLevelRepository: transactionStockLevelRepo,
          stockMovementRepository: transactionStockMovementRepo
        });
      }),
    };

    useCase = new TransferStockUseCase(stockLevelRepo, transactionManager);
  });

  function makeStockLevel(id: string, warehouseId: string, quantity: number): StockLevel {
    return StockLevel.create({
      id, tenantId: 'tenant1', productId: 'p1',
      productTenantId: 'tenant1', warehouseId, warehouseTenantId: 'tenant1',
      quantity
    });
  }

  it('should transfer stock successfully: decrease source, increase dest, create TRANSFER movement', async () => {
    const source = makeStockLevel('sl1', 'w1', 50);
    const dest = makeStockLevel('sl2', 'w2', 10);
    stockLevelRepo.findByProductAndWarehouse
      .mockResolvedValueOnce(source)   // source lookup
      .mockResolvedValueOnce(dest);    // dest lookup

    const result = await useCase.execute({
      tenantId: 'tenant1',
      productId: 'p1',
      fromWarehouseId: 'w1',
      toWarehouseId: 'w2',
      quantity: 20,
      reason: 'Rebalancing',
      authorUserId: 'u1',
      access: salesUser(),
      authorWarehouseId: 'w1'
    });

    expect(result.sourceStock.quantity).toBe(30);  // 50 - 20
    expect(result.destStock.quantity).toBe(30);     // 10 + 20
    expect(result.movement.type).toBe(StockMovementType.TRANSFER);
    expect(result.movement.fromWarehouseId).toBe('w1');
    expect(result.movement.toWarehouseId).toBe('w2');
    expect(result.movement.quantity).toBe(20);

    // Verify the transaction manager was called (not bypassed)
    expect(transactionManager.executeTransaction).toHaveBeenCalledTimes(1);
    // Verify saves happened through the TRANSACTIONAL repos, not the outer ones
    expect(transactionStockLevelRepo.save).toHaveBeenCalledTimes(2);
    expect(transactionStockMovementRepo.save).toHaveBeenCalledTimes(1);
    // Outer repo's save should NOT have been called
    expect(stockLevelRepo.save).not.toHaveBeenCalled();
  });

  it('should reject insufficient source stock and leave BOTH quantities unchanged', async () => {
    const source = makeStockLevel('sl1', 'w1', 5);
    const dest = makeStockLevel('sl2', 'w2', 10);
    stockLevelRepo.findByProductAndWarehouse
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(dest);

    await expect(useCase.execute({
      tenantId: 'tenant1',
      productId: 'p1',
      fromWarehouseId: 'w1',
      toWarehouseId: 'w2',
      quantity: 20, // More than source has
      authorUserId: 'u1',
      access: salesUser(),
      authorWarehouseId: 'w1'
    })).rejects.toThrow(NegativeStockError);

    // BOTH quantities must remain completely unchanged
    expect(source.quantity).toBe(5);   // Not modified
    expect(dest.quantity).toBe(10);    // Not modified

    // No saves should have been attempted
    expect(transactionManager.executeTransaction).not.toHaveBeenCalled();
    expect(transactionStockLevelRepo.save).not.toHaveBeenCalled();
    expect(transactionStockMovementRepo.save).not.toHaveBeenCalled();
  });

  it('should confirm IStockTransactionManager is used (no direct Prisma knowledge)', () => {
    // The use case's constructor takes IStockTransactionManager, not PrismaClient or any Prisma type.
    // This is a structural assertion: the use case file should NOT import anything from Prisma.
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, 'TransferStockUseCase.ts'),
      'utf-8'
    );
    expect(source).not.toContain('prisma');
    expect(source).not.toContain('Prisma');
    expect(source).not.toContain('@prisma/client');
    expect(source).toContain('IStockTransactionManager');
  });

  it('should reject if source stock level does not exist', async () => {
    stockLevelRepo.findByProductAndWarehouse.mockResolvedValueOnce(null);

    await expect(useCase.execute({
      tenantId: 'tenant1',
      productId: 'p1',
      fromWarehouseId: 'w1',
      toWarehouseId: 'w2',
      quantity: 10,
      authorUserId: 'u1',
      access: salesUser(),
      authorWarehouseId: 'w1'
    })).rejects.toThrow('Stock level not found for product p1 at source warehouse w1');
  });

  it('should reject if destination stock level does not exist', async () => {
    const source = makeStockLevel('sl1', 'w1', 50);
    stockLevelRepo.findByProductAndWarehouse
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(null);

    await expect(useCase.execute({
      tenantId: 'tenant1',
      productId: 'p1',
      fromWarehouseId: 'w1',
      toWarehouseId: 'w2',
      quantity: 10,
      authorUserId: 'u1',
      access: salesUser(),
      authorWarehouseId: 'w1'
    })).rejects.toThrow('Stock level not found for product p1 at destination warehouse w2');
  });

  it('should reject unauthorized roles', async () => {
    await expect(useCase.execute({
      tenantId: 'tenant1',
      productId: 'p1',
      fromWarehouseId: 'w1',
      toWarehouseId: 'w2',
      quantity: 10,
      authorUserId: 'u1',
      access: reception()
    })).rejects.toThrow(PermissionDeniedError);
  });

  it('should reject zero or negative transfer quantity', async () => {
    await expect(useCase.execute({
      tenantId: 'tenant1',
      productId: 'p1',
      fromWarehouseId: 'w1',
      toWarehouseId: 'w2',
      quantity: 0,
      authorUserId: 'u1',
      access: salesUser(),
      authorWarehouseId: 'w1'
    })).rejects.toThrow('Transfer quantity must be positive.');

    await expect(useCase.execute({
      tenantId: 'tenant1',
      productId: 'p1',
      fromWarehouseId: 'w1',
      toWarehouseId: 'w2',
      quantity: -5,
      authorUserId: 'u1',
      access: salesUser(),
      authorWarehouseId: 'w1'
    })).rejects.toThrow('Transfer quantity must be positive.');
  });
});
