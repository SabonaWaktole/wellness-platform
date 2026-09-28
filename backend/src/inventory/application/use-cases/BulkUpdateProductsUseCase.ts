import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionScope } from '../../../access/domain/PermissionScope';
import { IProductRepository } from '../../domain/repositories';
import { DeleteProductUseCase } from './DeleteProductUseCase';

export type BulkProductAction = 'archive' | 'unarchive' | 'delete';

export interface BulkUpdateProductsDTO {
  tenantId: string;
  ids: string[];
  action: BulkProductAction;
  access: AccessContext;
}

export interface BulkUpdateFailure {
  id: string;
  name?: string;
  reason: string;
}

export interface BulkUpdateProductsResult {
  succeeded: string[];
  failed: BulkUpdateFailure[];
}

/** Cap on one request, so a runaway selection cannot lock the table. */
export const BULK_ACTION_LIMIT = 200;

/**
 * Applies one action across a selection.
 *
 * Partial success is the honest outcome here: archiving 40 products should not
 * be undone because one of them was deleted in another tab. The result names
 * every id that failed and why, and the UI reports both halves.
 */
export class BulkUpdateProductsUseCase {
  constructor(
    private productRepo: IProductRepository,
    private deleteProductUseCase: DeleteProductUseCase
  ) {}

  async execute(dto: BulkUpdateProductsDTO): Promise<BulkUpdateProductsResult> {
    dto.access.ensureScope('inventory.manage', PermissionScope.All);
    if (dto.ids.length === 0) {
      throw new Error('Select at least one product.');
    }
    if (dto.ids.length > BULK_ACTION_LIMIT) {
      throw new Error(`Bulk actions are limited to ${BULK_ACTION_LIMIT} products at a time.`);
    }

    if (dto.action === 'delete') return this.deleteMany(dto);
    return this.setArchived(dto, dto.action === 'archive');
  }

  private async setArchived(
    dto: BulkUpdateProductsDTO,
    isArchived: boolean
  ): Promise<BulkUpdateProductsResult> {
    const products = await this.productRepo.findManyByIds(dto.tenantId, dto.ids);
    const found = new Set(products.map((product) => product.id));

    for (const product of products) {
      product.update({ isArchived });
    }
    await this.productRepo.saveMany(products);

    return {
      succeeded: products.map((product) => product.id),
      failed: dto.ids
        .filter((id) => !found.has(id))
        .map((id) => ({ id, reason: 'Product not found.' })),
    };
  }

  /**
   * Sequential rather than parallel: each delete runs its own transaction and
   * unlinks files, and a burst of those in parallel is a good way to exhaust a
   * connection pool for no user-visible gain.
   */
  private async deleteMany(dto: BulkUpdateProductsDTO): Promise<BulkUpdateProductsResult> {
    const products = await this.productRepo.findManyByIds(dto.tenantId, dto.ids);
    const namesById = new Map(products.map((product) => [product.id, product.name]));

    const succeeded: string[] = [];
    const failed: BulkUpdateFailure[] = [];

    for (const id of dto.ids) {
      try {
        await this.deleteProductUseCase.execute({
          tenantId: dto.tenantId,
          id,
          access: dto.access,
        });
        succeeded.push(id);
      } catch (error: any) {
        failed.push({
          id,
          name: namesById.get(id),
          reason: error?.message ?? 'Could not be deleted.',
        });
      }
    }

    return { succeeded, failed };
  }
}
