import { AccessContext } from '../../../access/domain/AccessContext';
import { IProductRepository, IStockLevelRepository } from '../../domain/repositories';
import { StockLevel } from '../../domain/StockLevel';
import { Product } from '../../domain/Product';

export interface GetProductStockBreakdownDTO {
  tenantId: string;
  productId: string;
  access: AccessContext;
}

export class GetProductStockBreakdownUseCase {
  constructor(
    private productRepo: IProductRepository,
    private stockLevelRepo: IStockLevelRepository
  ) {}

  async execute(dto: GetProductStockBreakdownDTO): Promise<{ product: Product; stockLevels: StockLevel[] }> {
    dto.access.ensure('inventory.manage');

    const product = await this.productRepo.findById(dto.tenantId, dto.productId);
    if (!product) {
      throw new Error(`Product ${dto.productId} not found`);
    }

    const stockLevels = await this.stockLevelRepo.findByProductId(dto.tenantId, dto.productId);

    return { product, stockLevels };
  }
}
