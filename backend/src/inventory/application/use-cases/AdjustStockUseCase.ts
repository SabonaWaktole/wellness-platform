import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { IStockLevelRepository, IStockMovementRepository } from '../../domain/repositories';
import { StockMovement, StockMovementType } from '../../domain/StockMovement';
import { StockLevel } from '../../domain/StockLevel';
import { randomUUID } from 'crypto';

export interface AdjustStockDTO {
  tenantId: string;
  productId: string;
  warehouseId: string;
  quantityChange: number; // positive = add, negative = remove
  reason: string;
  authorUserId: string;
  access: AccessContext;
  authorWarehouseId?: string | null;
}

export class AdjustStockUseCase {
  constructor(
    private stockLevelRepo: IStockLevelRepository,
    private stockMovementRepo: IStockMovementRepository
  ) {}

  async execute(dto: AdjustStockDTO): Promise<{ stockLevel: StockLevel; movement: StockMovement }> {
    dto.access.ensure('inventory.manage');

    if (dto.access.ownOnly('inventory.manage') && dto.authorWarehouseId !== dto.warehouseId) {
      throw new PermissionDeniedError('inventory.manage', 'Unauthorized: You can only adjust stock in your assigned warehouse.');
    }

    const stockLevel = await this.stockLevelRepo.findByProductAndWarehouse(
      dto.tenantId, dto.productId, dto.warehouseId
    );

    if (!stockLevel) {
      throw new Error(`Stock level not found for product ${dto.productId} at warehouse ${dto.warehouseId}`);
    }

    // This will throw NegativeStockError if the adjustment drops below zero
    stockLevel.adjustQuantity(dto.quantityChange);

    const movement = StockMovement.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      productId: dto.productId,
      warehouseId: dto.warehouseId,
      quantity: dto.quantityChange,
      type: StockMovementType.ADJUSTMENT,
      reason: dto.reason,
      createdBy: dto.authorUserId,
    });

    await this.stockLevelRepo.save(stockLevel);
    await this.stockMovementRepo.save(movement);

    return { stockLevel, movement };
  }
}
