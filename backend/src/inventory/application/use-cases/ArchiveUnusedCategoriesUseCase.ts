import { PermissionScope } from '../../../access/domain/PermissionScope';
import { AccessContext } from '../../../access/domain/AccessContext';
import { ICategoryRepository } from '../../domain/repositories';

export interface ArchiveUnusedCategoriesRequest {
  tenantId: string;
  access: AccessContext;
}

/** A candidate, named so the user can see what is about to be archived. */
export interface UnusedCategorySummary {
  id: string;
  name: string;
}

export interface UnusedCategoriesResult {
  count: number;
  categories: UnusedCategorySummary[];
}

/**
 * Archives every category that is genuinely unused.
 *
 * Previously this took an optional `limit` defaulting to 3, and the controller
 * passed `3` with the comment "Fixed limit matching UI mock" — a number
 * invented for a design mock that had become a bound on a destructive
 * operation. Worse, the query it called had no notion of "unused" at all: it
 * ordered categories by last-touched and archived the top N, so a tenant whose
 * categories were all in use lost three real ones.
 *
 * Both are gone. The repository now answers a real question (see
 * `findUnusedCategories`), and this use case archives exactly what that
 * question returns — no more, and no arbitrary fewer. TD-027.
 */
export class ArchiveUnusedCategoriesUseCase {
  constructor(private categoryRepository: ICategoryRepository) {}

  /**
   * What *would* be archived, without archiving it.
   *
   * The count shown in the UI and the button's effect must come from this one
   * query. The count used to be computed independently in the frontend, which
   * is how a hard-coded "3" could sit above an action that did something
   * entirely different.
   */
  async preview(request: ArchiveUnusedCategoriesRequest): Promise<UnusedCategoriesResult> {
    request.access.ensureScope('inventory.manage', PermissionScope.All);
    const candidates = await this.categoryRepository.findUnusedCategories(request.tenantId);
    return this.summarise(candidates);
  }

  async execute(request: ArchiveUnusedCategoriesRequest): Promise<UnusedCategoriesResult> {
    request.access.ensureScope('inventory.manage', PermissionScope.All);

    const categoriesToArchive = await this.categoryRepository.findUnusedCategories(request.tenantId);

    for (const category of categoriesToArchive) {
      category.update({ isArchived: true });
      await this.categoryRepository.update(category);
    }

    return this.summarise(categoriesToArchive);
  }

  private summarise(categories: { id: string; name: string }[]): UnusedCategoriesResult {
    return {
      count: categories.length,
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
    };
  }
}
