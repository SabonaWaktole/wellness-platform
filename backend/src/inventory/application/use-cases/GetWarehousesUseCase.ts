import { AccessContext } from '../../../access/domain/AccessContext';
import { IWarehouseRepository } from '../../domain/repositories';
import { Warehouse } from '../../domain/Warehouse';

export interface GetWarehousesRequest {
  tenantId: string;
  access: AccessContext;
  authorWarehouseId?: string | null;
}

export class GetWarehousesUseCase {
  constructor(private warehouseRepository: IWarehouseRepository) {}

  async execute(request: GetWarehousesRequest): Promise<Warehouse[]> {
    request.access.ensure('inventory.manage');

    const allWarehouses = await this.warehouseRepository.findAllByTenantId(request.tenantId);

    if (request.access.ownOnly('inventory.manage')) {
      if (!request.authorWarehouseId) {
        return [];
      }
      return allWarehouses.filter(w => w.id === request.authorWarehouseId);
    }

    return allWarehouses;
  }
}
