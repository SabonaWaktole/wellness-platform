import { AccessContext } from '../../../access/domain/AccessContext';
import { IProductRepository, ProductWithStock } from '../../domain/repositories';

export interface GetProductDTO {
  tenantId: string;
  id: string;
  access: AccessContext;
  authorWarehouseId?: string | null;
}

/**
 * Loads one product with its stock, images and derived status — everything the
 * edit form needs in a single round trip.
 */
export class GetProductUseCase {
  constructor(private productRepo: IProductRepository) {}

  async execute(dto: GetProductDTO): Promise<ProductWithStock> {
    dto.access.ensure('inventory.manage');

    const product = await this.productRepo.findWithStock(dto.tenantId, dto.id);
    if (!product) {
      throw new Error(`Product ${dto.id} not found`);
    }

    return product;
  }
}
