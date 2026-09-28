import { UpdateProductUseCase } from './UpdateProductUseCase';
import { IProductRepository } from '../../domain/repositories';
import { Product } from '../../domain/Product';
import { administrator, reception, salesUser } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('UpdateProductUseCase', () => {
  let useCase: UpdateProductUseCase;
  let productRepo: jest.Mocked<IProductRepository>;

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
    useCase = new UpdateProductUseCase(productRepo);
  });

  it('should update product fields successfully', async () => {
    const existingProduct = Product.create({
      id: 'p1', tenantId: 'tenant1', name: 'Old Name', description: 'Old Desc', categoryId: null, price: 100
    });
    productRepo.findById.mockResolvedValue(existingProduct);

    const result = await useCase.execute({
      tenantId: 'tenant1',
      id: 'p1',
      name: 'New Name',
      price: 150,
      access: administrator()
    });

    expect(result.name).toBe('New Name');
    expect(result.price).toBe(150);
    expect(result.description).toBe('Old Desc'); // Unchanged
    expect(productRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should explicitly ignore any attempt to pass stock levels in the payload', async () => {
    const existingProduct = Product.create({
      id: 'p1', tenantId: 'tenant1', name: 'Old Name', description: 'Old Desc', categoryId: null, price: 100
    });
    productRepo.findById.mockResolvedValue(existingProduct);

    const maliciousPayload: any = {
      tenantId: 'tenant1',
      id: 'p1',
      name: 'New Name',
      access: salesUser(), authorWarehouseId: 'w1',
      stockLevels: [{ quantity: 9999 }] // Ignored by typescript interface, but passing to test runtime behavior
    };

    const result = await useCase.execute(maliciousPayload);

    // The product entity does not store stockLevels anyway, 
    // and the use case doesn't invoke any stock repositories.
    expect((result as any).stockLevels).toBeUndefined();
    expect(result.name).toBe('New Name');
  });

  it('should reject unauthorized roles', async () => {
    await expect(useCase.execute({
      tenantId: 'tenant1',
      id: 'p1',
      name: 'New Name',
      access: reception()
    })).rejects.toThrow(PermissionDeniedError);
  });
});
