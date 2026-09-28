import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionScope } from '../../../access/domain/PermissionScope';
import { ICategoryRepository, IProductRepository } from '../../domain/repositories';
import { CategoryInUseError } from '../../domain/inUseErrors';

export interface DeleteCategoryDTO {
  tenantId: string;
  id: string;
  access: AccessContext;
}

export class DeleteCategoryUseCase {
  constructor(
    private categoryRepo: ICategoryRepository,
    private productRepo: IProductRepository
  ) {}

  async execute(dto: DeleteCategoryDTO): Promise<void> {
    dto.access.ensureScope('inventory.manage', PermissionScope.All);

    const category = await this.categoryRepo.findById(dto.tenantId, dto.id);
    if (!category) {
      throw new Error(`Category ${dto.id} not found`);
    }

    // Block deletion if any product uses this category
    const productCount = await this.productRepo.countByCategoryId(dto.tenantId, dto.id);
    if (productCount > 0) {
      throw new CategoryInUseError(dto.id);
    }

    await this.categoryRepo.delete(dto.tenantId, dto.id);
  }
}
