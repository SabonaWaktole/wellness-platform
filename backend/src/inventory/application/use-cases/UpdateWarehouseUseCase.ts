import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionScope } from '../../../access/domain/PermissionScope';
import { IWarehouseRepository } from '../../domain/repositories';
import { Warehouse } from '../../domain/Warehouse';

export interface UpdateWarehouseDTO {
  tenantId: string;
  id: string;
  name?: string;
  address?: string | null;
  access: AccessContext;
}

export class UpdateWarehouseUseCase {
  constructor(private warehouseRepo: IWarehouseRepository) {}

  async execute(dto: UpdateWarehouseDTO): Promise<Warehouse> {
    dto.access.ensureScope('inventory.manage', PermissionScope.All);

    const warehouse = await this.warehouseRepo.findById(dto.tenantId, dto.id);
    if (!warehouse) {
      throw new Error(`Warehouse ${dto.id} not found`);
    }

    warehouse.update({ name: dto.name, address: dto.address });
    await this.warehouseRepo.update(warehouse);
    return warehouse;
  }
}
