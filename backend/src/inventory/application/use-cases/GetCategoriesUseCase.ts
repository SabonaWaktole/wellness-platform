import { AccessContext } from '../../../access/domain/AccessContext';
import { ICategoryRepository, CategoryWithItemCount } from '../../domain/repositories';

export interface GetCategoriesRequest {
  tenantId: string;
  access: AccessContext;
  includeArchived?: boolean;
}

export class GetCategoriesUseCase {
  constructor(private categoryRepository: ICategoryRepository) {}

  async execute(request: GetCategoriesRequest): Promise<CategoryWithItemCount[]> {
    request.access.ensure('inventory.manage');

    return this.categoryRepository.findAllWithItemCount(request.tenantId, request.includeArchived);
  }
}
