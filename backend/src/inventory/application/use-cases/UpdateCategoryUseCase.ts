import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionScope } from '../../../access/domain/PermissionScope';
import { ICategoryRepository } from '../../domain/repositories';
import { Category } from '../../domain/Category';

export interface UpdateCategoryDTO {
  tenantId: string;
  id: string;
  name?: string;
  description?: string;
  access: AccessContext;
}

export class UpdateCategoryUseCase {
  constructor(private categoryRepo: ICategoryRepository) {}

  async execute(dto: UpdateCategoryDTO): Promise<Category> {
    dto.access.ensureScope('inventory.manage', PermissionScope.All);

    const category = await this.categoryRepo.findById(dto.tenantId, dto.id);
    if (!category) {
      throw new Error(`Category ${dto.id} not found`);
    }

    category.update({ name: dto.name, description: dto.description });
    await this.categoryRepo.update(category);
    return category;
  }
}
