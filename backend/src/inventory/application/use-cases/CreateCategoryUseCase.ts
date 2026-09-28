import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionScope } from '../../../access/domain/PermissionScope';
import { ICategoryRepository } from '../../domain/repositories';
import { Category } from '../../domain/Category';
import { randomUUID } from 'crypto';

export interface CreateCategoryDTO {
  tenantId: string;
  name: string;
  description?: string;
  access: AccessContext;
}

export class CreateCategoryUseCase {
  constructor(private categoryRepo: ICategoryRepository) {}

  async execute(dto: CreateCategoryDTO): Promise<Category> {
    dto.access.ensureScope('inventory.manage', PermissionScope.All);

    const category = Category.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      name: dto.name,
      description: dto.description,
    });

    await this.categoryRepo.save(category);
    return category;
  }
}
