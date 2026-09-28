import { GetProductStockBreakdownUseCase } from './GetProductStockBreakdownUseCase';
import { IProductRepository, IStockLevelRepository } from '../../domain/repositories';
import { Product } from '../../domain/Product';
import { StockLevel } from '../../domain/StockLevel';
import { reception, salesUser } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('GetProductStockBreakdownUseCase', () => {
  let useCase: GetProductStockBreakdownUseCase;
  let productRepo: jest.Mocked<IProductRepository>;
  let stockLevelRepo: jest.Mocked<IStockLevelRepository>;

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
    stockLevelRepo = {
      findById: jest.fn(),
      findByProductAndWarehouse: jest.fn(),
      findByProductId: jest.fn(),
      save: jest.fn(),
      countByWarehouseId: jest.fn(),
    };
    useCase = new GetProductStockBreakdownUseCase(productRepo, stockLevelRepo);
  });

  it('should return product and its stock levels by warehouse', async () => {
    const product = Product.create({
      id: 'p1', tenantId: 'tenant1', name: 'Test', description: 'Desc', categoryId: null, price: 100
    });
    const sl1 = StockLevel.create({
      id: 'sl1', tenantId: 'tenant1', productId: 'p1',
      productTenantId: 'tenant1', warehouseId: 'w1', warehouseTenantId: 'tenant1', quantity: 30
    });
    const sl2 = StockLevel.create({
      id: 'sl2', tenantId: 'tenant1', productId: 'p1',
      productTenantId: 'tenant1', warehouseId: 'w2', warehouseTenantId: 'tenant1', quantity: 15
    });

    productRepo.findById.mockResolvedValue(product);
    stockLevelRepo.findByProductId.mockResolvedValue([sl1, sl2]);

    const result = await useCase.execute({
      tenantId: 'tenant1',
      productId: 'p1',
      access: salesUser()
    });

    expect(result.product.id).toBe('p1');
    expect(result.stockLevels.length).toBe(2);
    expect(result.stockLevels[0].quantity).toBe(30);
    expect(result.stockLevels[1].quantity).toBe(15);
  });

  it('should enforce tenant isolation: reject product from different tenant', async () => {
    // productRepo.findById is scoped by tenantId — returns null for wrong tenant
    productRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({
      tenantId: 'tenant1',
      productId: 'p-from-tenant2',
      access: salesUser()
    })).rejects.toThrow('Product p-from-tenant2 not found');
  });

  it('should reject unauthorized roles', async () => {
    await expect(useCase.execute({
      tenantId: 'tenant1',
      productId: 'p1',
      access: reception()
    })).rejects.toThrow(PermissionDeniedError);
  });
});
