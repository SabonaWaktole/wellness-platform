import { ArchiveUnusedCategoriesUseCase } from './ArchiveUnusedCategoriesUseCase';
import { ICategoryRepository } from '../../domain/repositories';
import { Category } from '../../domain/Category';
import { administrator, salesUser } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

/**
 * The previous version of this suite asserted
 *
 *   expect(categoryRepo.findLeastRecentlyUsedCategories)
 *     .toHaveBeenCalledWith('tenant1', 3);
 *
 * which pinned the defect in place rather than describing behaviour: the `3`
 * came from a UI mock, and the query it named archived the least-recently-
 * touched categories whether or not they were in use. A passing test asserting
 * a fabricated constant is worse than no test, because it makes the bug look
 * deliberate. It is replaced, not adjusted. TD-027.
 *
 * These are unit tests over the use case's own logic — authorisation, archiving
 * every candidate, and preview not mutating. Whether a category *is* unused is
 * a database question and is covered in
 * tests/integration/inventory/categoryCleanup.test.ts.
 */
describe('ArchiveUnusedCategoriesUseCase', () => {
  let categoryRepo: jest.Mocked<ICategoryRepository>;
  let useCase: ArchiveUnusedCategoriesUseCase;

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
    useCase = new ArchiveUnusedCategoriesUseCase(categoryRepo);
  });

  it('archives every unused category, with no limit imposed', async () => {
    // Five, deliberately more than the old hard-coded 3: the point of the fix
    // is that the count comes from the data, not from a constant.
    const categories = ['a', 'b', 'c', 'd', 'e'].map((k) =>
      Category.create({ id: `c-${k}`, tenantId: 'tenant1', name: `Cat ${k.toUpperCase()}` })
    );
    categoryRepo.findUnusedCategories.mockResolvedValue(categories);

    const result = await useCase.execute({
      tenantId: 'tenant1',
      access: administrator(),
    });

    expect(result.count).toBe(5);
    expect(categoryRepo.update).toHaveBeenCalledTimes(5);
    expect(categories.every((c) => c.isArchived)).toBe(true);
    // Asks the repository the unused question, and passes it nothing else.
    expect(categoryRepo.findUnusedCategories).toHaveBeenCalledWith('tenant1');
  });

  it('names what it archived, so the caller can report specifics', async () => {
    categoryRepo.findUnusedCategories.mockResolvedValue([
      Category.create({ id: 'c1', tenantId: 'tenant1', name: 'Obsolete Fittings' }),
    ]);

    const result = await useCase.execute({
      tenantId: 'tenant1',
      access: administrator(),
    });

    expect(result.categories).toEqual([{ id: 'c1', name: 'Obsolete Fittings' }]);
  });

  it('archives nothing when nothing is unused', async () => {
    categoryRepo.findUnusedCategories.mockResolvedValue([]);

    const result = await useCase.execute({
      tenantId: 'tenant1',
      access: administrator(),
    });

    expect(result.count).toBe(0);
    expect(categoryRepo.update).not.toHaveBeenCalled();
  });

  describe('preview', () => {
    it('reports the same candidates without archiving any of them', async () => {
      const cat = Category.create({ id: 'c1', tenantId: 'tenant1', name: 'Cat A' });
      categoryRepo.findUnusedCategories.mockResolvedValue([cat]);

      const result = await useCase.preview({
        tenantId: 'tenant1',
        access: administrator(),
      });

      expect(result.count).toBe(1);
      expect(result.categories).toEqual([{ id: 'c1', name: 'Cat A' }]);
      // The whole point of a preview.
      expect(cat.isArchived).toBe(false);
      expect(categoryRepo.update).not.toHaveBeenCalled();
    });

    it('rejects non-business owners', async () => {
      await expect(
        useCase.preview({ tenantId: 'tenant1', access: salesUser() })
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  it('rejects non-business owners', async () => {
    await expect(
      useCase.execute({ tenantId: 'tenant1', access: salesUser() })
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('does not read the repository at all when unauthorised', async () => {
    await expect(
      useCase.execute({ tenantId: 'tenant1', access: salesUser() })
    ).rejects.toThrow(PermissionDeniedError);

    expect(categoryRepo.findUnusedCategories).not.toHaveBeenCalled();
    expect(categoryRepo.update).not.toHaveBeenCalled();
  });
});
