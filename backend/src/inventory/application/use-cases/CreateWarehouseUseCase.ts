import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionScope } from '../../../access/domain/PermissionScope';
import { IWarehouseRepository } from '../../domain/repositories';
import { Warehouse } from '../../domain/Warehouse';
import { randomUUID } from 'crypto';

export interface CreateWarehouseDTO {
  tenantId: string;
  name: string;
  address?: string;
  access: AccessContext;
}

export class CreateWarehouseUseCase {
  constructor(private warehouseRepo: IWarehouseRepository) {}

  async execute(dto: CreateWarehouseDTO): Promise<Warehouse> {
    dto.access.ensureScope('inventory.manage', PermissionScope.All);

    const warehouse = Warehouse.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      name: dto.name,
      address: dto.address,
    });

    await this.warehouseRepo.save(warehouse);
    return warehouse;
  }
}
