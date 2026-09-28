import { AdjustStockUseCase } from './AdjustStockUseCase';
import { IStockLevelRepository, IStockMovementRepository } from '../../domain/repositories';
import { StockLevel } from '../../domain/StockLevel';
import { NegativeStockError } from '../../domain/errors';
import { StockMovementType } from '../../domain/StockMovement';
import { administrator, reception, salesUser } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('AdjustStockUseCase', () => {
  let useCase: AdjustStockUseCase;
  let stockLevelRepo: jest.Mocked<IStockLevelRepository>;
  let stockMovementRepo: jest.Mocked<IStockMovementRepository>;

  beforeEach(() => {
    stockLevelRepo = {
      findById: jest.fn(),
      findByProductAndWarehouse: jest.fn(),
      findByProductId: jest.fn(),
      save: jest.fn(),
      countByWarehouseId: jest.fn(),
    };
    stockMovementRepo = {
      save: jest.fn(),
    };
    useCase = new AdjustStockUseCase(stockLevelRepo, stockMovementRepo);
  });

  it('should adjust stock upward and create an ADJUSTMENT movement', async () => {
    const existingStock = StockLevel.create({
      id: 'sl1', tenantId: 'tenant1', productId: 'p1',
      productTenantId: 'tenant1', warehouseId: 'w1', warehouseTenantId: 'tenant1',
      quantity: 20
    });
    stockLevelRepo.findByProductAndWarehouse.mockResolvedValue(existingStock);

    const result = await useCase.execute({
      tenantId: 'tenant1',
      productId: 'p1',
      warehouseId: 'w1',
      quantityChange: 10,
      reason: 'Received shipment',
      authorUserId: 'u1',
      access: salesUser(),
      authorWarehouseId: 'w1'
    });

    expect(result.stockLevel.quantity).toBe(30);
    expect(result.movement.type).toBe(StockMovementType.ADJUSTMENT);
    expect(result.movement.warehouseId).toBe('w1');
    expect(result.movement.quantity).toBe(10);
    expect(result.movement.reason).toBe('Received shipment');
    expect(stockLevelRepo.save).toHaveBeenCalledTimes(1);
    expect(stockMovementRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should adjust stock downward successfully', async () => {
    const existingStock = StockLevel.create({
      id: 'sl1', tenantId: 'tenant1', productId: 'p1',
      productTenantId: 'tenant1', warehouseId: 'w1', warehouseTenantId: 'tenant1',
      quantity: 20
    });
    stockLevelRepo.findByProductAndWarehouse.mockResolvedValue(existingStock);

    const result = await useCase.execute({
      tenantId: 'tenant1',
      productId: 'p1',
      warehouseId: 'w1',
      quantityChange: -15,
      reason: 'Damaged goods',
      authorUserId: 'u1',
      access: administrator()
    });

    expect(result.stockLevel.quantity).toBe(5);
  });

  it('should surface NegativeStockError from the domain entity (not swallow it)', async () => {
    const existingStock = StockLevel.create({
      id: 'sl1', tenantId: 'tenant1', productId: 'p1',
      productTenantId: 'tenant1', warehouseId: 'w1', warehouseTenantId: 'tenant1',
      quantity: 5
    });
    stockLevelRepo.findByProductAndWarehouse.mockResolvedValue(existingStock);

    await expect(useCase.execute({
      tenantId: 'tenant1',
      productId: 'p1',
      warehouseId: 'w1',
      quantityChange: -10,
      reason: 'Removing stock',
      authorUserId: 'u1',
      access: salesUser(),
      authorWarehouseId: 'w1'
    })).rejects.toThrow(NegativeStockError);

    // Verify no saves happened after the domain error
    expect(stockLevelRepo.save).not.toHaveBeenCalled();
    expect(stockMovementRepo.save).not.toHaveBeenCalled();
  });

  it('should reject if stock level does not exist', async () => {
    stockLevelRepo.findByProductAndWarehouse.mockResolvedValue(null);
    await expect(useCase.execute({
      tenantId: 'tenant1',
      productId: 'p1',
      warehouseId: 'w1',
      quantityChange: 5,
      reason: 'Test',
      authorUserId: 'u1',
      access: salesUser(),
      authorWarehouseId: 'w1'
    })).rejects.toThrow('Stock level not found for product p1 at warehouse w1');

    expect(stockLevelRepo.save).not.toHaveBeenCalled();
    expect(stockMovementRepo.save).not.toHaveBeenCalled();
  });

  it('should reject unauthorized roles', async () => {
    await expect(useCase.execute({
      tenantId: 'tenant1',
      productId: 'p1',
      warehouseId: 'w1',
      quantityChange: 5,
      reason: 'Test',
      authorUserId: 'u1',
      access: reception()
    })).rejects.toThrow(PermissionDeniedError);

    expect(stockLevelRepo.findByProductAndWarehouse).not.toHaveBeenCalled();
  });
});
