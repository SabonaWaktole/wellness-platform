import { AccessContext } from '../../../access/domain/AccessContext';
import { IProductRepository } from '../../domain/repositories';

export interface GetProductFacetsDTO {
  tenantId: string;
  access: AccessContext;
}

export interface ProductFacets {
  brands: string[];
  tags: string[];
}

/**
 * The distinct brands and tags in a tenant's catalogue, used to populate the
 * list's filter dropdowns and the tag input's suggestions.
 */
export class GetProductFacetsUseCase {
  constructor(private productRepo: IProductRepository) {}

  async execute(dto: GetProductFacetsDTO): Promise<ProductFacets> {
    dto.access.ensure('inventory.manage');

    const [brands, tags] = await Promise.all([
      this.productRepo.listBrands(dto.tenantId),
      this.productRepo.listTags(dto.tenantId),
    ]);

    return { brands, tags };
  }
}
