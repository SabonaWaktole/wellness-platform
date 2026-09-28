import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { IProductRepository } from '../../domain/repositories';
import { Product } from '../../domain/Product';
import { DuplicateSkuError } from '../../domain/inUseErrors';

export interface UpdateProductDTO {
  tenantId: string;
  id: string;
  name?: string;
  description?: string;
  sku?: string | null;
  brand?: string | null;
  categoryId?: string | null;
  price?: number;
  cost?: number | null;
  tags?: string[];
  lowStockThreshold?: number;
  isArchived?: boolean;
  access: AccessContext;
  authorWarehouseId?: string | null;
}

export class UpdateProductUseCase {
  constructor(private productRepo: IProductRepository) {}

  async execute(dto: UpdateProductDTO): Promise<Product> {
    dto.access.ensure('inventory.manage');

    if (dto.access.ownOnly('inventory.manage') && !dto.authorWarehouseId) {
      throw new PermissionDeniedError('inventory.manage', 'Unauthorized: You must be assigned to a warehouse to update products.');
    }

    const product = await this.productRepo.findById(dto.tenantId, dto.id);
    if (!product) {
      throw new Error(`Product ${dto.id} not found`);
    }

    // Only worth a lookup when the SKU is actually changing — re-saving a
    // product with its own SKU must not conflict with itself.
    const sku = dto.sku?.trim();
    if (sku && sku !== product.sku) {
      const existing = await this.productRepo.findBySku(dto.tenantId, sku);
      if (existing && existing.id !== product.id) throw new DuplicateSkuError(sku);
    }

    product.update({
      name: dto.name,
      description: dto.description,
      sku: dto.sku,
      brand: dto.brand,
      categoryId: dto.categoryId,
      price: dto.price,
      cost: dto.cost,
      tags: dto.tags,
      lowStockThreshold: dto.lowStockThreshold,
      isArchived: dto.isArchived
    });

    await this.productRepo.save(product);

    return product;
  }
}
