import { GetCategoriesUseCase } from './GetCategoriesUseCase';
import { ICategoryRepository } from '../../domain/repositories';
import { Category } from '../../domain/Category';
import { administrator, reception, salesUser } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('GetCategoriesUseCase', () => {
  let categoryRepo: jest.Mocked<ICategoryRepository>;
  let useCase: GetCategoriesUseCase;

  beforeEach(() => {
    categoryRepo = {
      findById: jest.fn(),
      findAllByTenantId: jest.fn(),
      findAllWithItemCount: jest.fn(),
      findUnusedCategories: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new GetCategoriesUseCase(categoryRepo);
  });

  it('should allow BUSINESS_OWNER to list categories', async () => {
    categoryRepo.findAllWithItemCount.mockResolvedValue([
      { category: Category.create({ id: 'c1', tenantId: 'tenant1', name: 'Cat A' }), itemCount: 0 },
      { category: Category.create({ id: 'c2', tenantId: 'tenant1', name: 'Cat B' }), itemCount: 10 }
    ]);

    const results = await useCase.execute({
      tenantId: 'tenant1',
      access: administrator()
    });

    expect(results).toHaveLength(2);
    expect(results[0].category.name).toBe('Cat A');
    expect(categoryRepo.findAllWithItemCount).toHaveBeenCalledWith('tenant1', undefined);
  });

  it('should allow STAFF to list categories', async () => {
    categoryRepo.findAllWithItemCount.mockResolvedValue([
      { category: Category.create({ id: 'c1', tenantId: 'tenant1', name: 'Cat A' }), itemCount: 0 }
    ]);

    const results = await useCase.execute({
      tenantId: 'tenant1',
      access: salesUser()
    });

    expect(results).toHaveLength(1);
    expect(categoryRepo.findAllWithItemCount).toHaveBeenCalledWith('tenant1', undefined);
  });

  it('should reject SUPER_ADMIN from listing tenant categories', async () => {
    await expect(useCase.execute({
      tenantId: 'tenant1',
      access: reception()
    })).rejects.toThrow(PermissionDeniedError);
  });

  it('should explicitly scope query to tenantId, proving tenant isolation', async () => {
    await useCase.execute({
      tenantId: 'tenant-isolated',
      access: administrator()
    });

    expect(categoryRepo.findAllWithItemCount).toHaveBeenCalledTimes(1);
    expect(categoryRepo.findAllWithItemCount).toHaveBeenCalledWith('tenant-isolated', undefined);
  });
});
