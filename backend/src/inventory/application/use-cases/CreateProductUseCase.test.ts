import { CreateProductUseCase } from './CreateProductUseCase';
import { IProductRepository, IWarehouseRepository, IStockLevelRepository, IStockTransactionManager } from '../../domain/repositories';
import { Product } from '../../domain/Product';
import { Warehouse } from '../../domain/Warehouse';
import { CrossTenantIsolationError } from '../../domain/errors';
import { administrator, reception, salesUser } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('CreateProductUseCase', () => {
  let useCase: CreateProductUseCase;
  let productRepo: jest.Mocked<IProductRepository>;
  let warehouseRepo: jest.Mocked<IWarehouseRepository>;
  let stockLevelRepo: jest.Mocked<IStockLevelRepository>;
  let transactionManager: jest.Mocked<IStockTransactionManager>;

  beforeEach(() => {
    productRepo = {
      findById: jest.fn(),
      findBySku: jest.fn(),
      findManyByIds: jest.fn(),
      findWithStock: jest.fn(),
      save: jest.fn(),
      saveMany: jest.fn(),
      delete: jest.fn(),
      search: jest.fn(),
      summarise: jest.fn(),
      countByCategoryId: jest.fn(),
      countQuotationReferences: jest.fn(),
      listBrands: jest.fn(),
      listTags: jest.fn(),
    };
    warehouseRepo = {
      findById: jest.fn(),
      findAllByTenantId: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    stockLevelRepo = {
      findById: jest.fn(),
      findByProductAndWarehouse: jest.fn(),
      findByProductId: jest.fn(),
      save: jest.fn(),
      countByWarehouseId: jest.fn(),
    };
    transactionManager = {
      executeTransaction: jest.fn().mockImplementation(async (work) => {
        return work({ stockLevelRepository: stockLevelRepo });
      }),
    } as any; // Using simplified mock for now

    useCase = new CreateProductUseCase(productRepo, warehouseRepo, transactionManager);
  });

  it('should create a product with zero initial locations', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant1',
      name: 'Test Product',
      description: 'Desc',
      categoryId: null,
      price: 100,
      initialStock: [],
      access: administrator()
    });

    expect(result.product.name).toBe('Test Product');
    expect(result.stockLevels.length).toBe(0);
    expect(productRepo.save).toHaveBeenCalledTimes(1);
    expect(stockLevelRepo.save).toHaveBeenCalledTimes(0);
  });

  it('should create a product and initial stock levels', async () => {
    warehouseRepo.findById.mockResolvedValue(Warehouse.create({
      id: 'w1',
      tenantId: 'tenant1',
      name: 'Main Hub'
    }));

    const result = await useCase.execute({
      tenantId: 'tenant1',
      name: 'Test Product',
      description: 'Desc',
      categoryId: null,
      price: 100,
      initialStock: [{ warehouseId: 'w1', quantity: 50 }],
      access: salesUser(),
      authorWarehouseId: 'w1'
    });

    expect(result.product.name).toBe('Test Product');
    expect(result.stockLevels.length).toBe(1);
    expect(result.stockLevels[0].quantity).toBe(50);
    expect(productRepo.save).toHaveBeenCalledTimes(1);
    expect(stockLevelRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should reject if a warehouse belongs to a different tenant', async () => {
    warehouseRepo.findById.mockResolvedValue(Warehouse.create({
      id: 'w1',
      tenantId: 'tenant2', // Mismatch
      name: 'Rogue Hub'
    }));

    await expect(useCase.execute({
      tenantId: 'tenant1',
      name: 'Test Product',
      description: 'Desc',
      categoryId: null,
      price: 100,
      initialStock: [{ warehouseId: 'w1', quantity: 50 }],
      access: administrator()
    })).rejects.toThrow(CrossTenantIsolationError);

    expect(productRepo.save).not.toHaveBeenCalled();
    expect(stockLevelRepo.save).not.toHaveBeenCalled();
  });

  it('should reject if warehouse does not exist', async () => {
    warehouseRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({
      tenantId: 'tenant1',
      name: 'Test Product',
      description: 'Desc',
      categoryId: null,
      price: 100,
      initialStock: [{ warehouseId: 'w1', quantity: 50 }],
      access: administrator()
    })).rejects.toThrow('Warehouse w1 not found');

    expect(productRepo.save).not.toHaveBeenCalled();
  });

  it('should reject if called by an unauthorized role (e.g. SUPER_ADMIN)', async () => {
    await expect(useCase.execute({
      tenantId: 'tenant1',
      name: 'Test Product',
      description: 'Desc',
      categoryId: null,
      price: 100,
      initialStock: [],
      access: reception()
    })).rejects.toThrow(PermissionDeniedError);
  });

  it('should bubble up errors during transaction and ensure atomic partial failure', async () => {
    warehouseRepo.findById.mockResolvedValueOnce(Warehouse.create({
      id: 'w1', tenantId: 'tenant1', name: 'Hub 1'
    })).mockResolvedValueOnce(Warehouse.create({
      id: 'w2', tenantId: 'tenant1', name: 'Hub 2'
    }));

    // Simulate failure on the second stock level save inside the transaction
    stockLevelRepo.save
      .mockResolvedValueOnce(undefined) // First save succeeds
      .mockRejectedValueOnce(new Error('DB Constraint Violation')); // Second save fails

    await expect(useCase.execute({
      tenantId: 'tenant1',
      name: 'Test Product',
      description: 'Desc',
      categoryId: null,
      price: 100,
      initialStock: [
        { warehouseId: 'w1', quantity: 50 },
        { warehouseId: 'w2', quantity: 30 }
      ],
      access: administrator()
    })).rejects.toThrow('DB Constraint Violation');

    // Because the transactionManager.executeTransaction ensures atomicity,
    // we prove the use case propagates the transaction closure's error
    // (Actual rollback is handled by the Prisma transaction implementation, 
    // but the use case correctly wraps it all).
    expect(productRepo.save).toHaveBeenCalledTimes(1);
    expect(stockLevelRepo.save).toHaveBeenCalledTimes(2); // Attempted second, threw error
  });
});
