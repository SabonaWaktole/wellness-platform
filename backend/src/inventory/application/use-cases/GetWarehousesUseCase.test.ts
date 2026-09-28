import { GetWarehousesUseCase } from './GetWarehousesUseCase';
import { IWarehouseRepository } from '../../domain/repositories';
import { Warehouse } from '../../domain/Warehouse';
import { administrator, reception, salesUser } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('GetWarehousesUseCase', () => {
  let warehouseRepo: jest.Mocked<IWarehouseRepository>;
  let useCase: GetWarehousesUseCase;

  beforeEach(() => {
    warehouseRepo = {
      findById: jest.fn(),
      findAllByTenantId: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new GetWarehousesUseCase(warehouseRepo);
  });

  it('should allow BUSINESS_OWNER to list warehouses', async () => {
    warehouseRepo.findAllByTenantId.mockResolvedValue([
      Warehouse.create({ id: 'w1', tenantId: 'tenant1', name: 'Hub A' }),
      Warehouse.create({ id: 'w2', tenantId: 'tenant1', name: 'Hub B' })
    ]);

    const results = await useCase.execute({
      tenantId: 'tenant1',
      access: administrator()
    });

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('Hub A');
    expect(warehouseRepo.findAllByTenantId).toHaveBeenCalledWith('tenant1');
  });

  it('should allow STAFF to list warehouses', async () => {
    warehouseRepo.findAllByTenantId.mockResolvedValue([
      Warehouse.create({ id: 'w1', tenantId: 'tenant1', name: 'Hub A' })
    ]);

    const results = await useCase.execute({
      tenantId: 'tenant1',
      access: salesUser(),
      authorWarehouseId: 'w1'
    });

    expect(results).toHaveLength(1);
    expect(warehouseRepo.findAllByTenantId).toHaveBeenCalledWith('tenant1');
  });

  it('should reject SUPER_ADMIN from listing tenant warehouses', async () => {
    await expect(useCase.execute({
      tenantId: 'tenant1',
      access: reception()
    })).rejects.toThrow(PermissionDeniedError);
  });

  it('should explicitly scope query to tenantId, proving tenant isolation', async () => {
    await useCase.execute({
      tenantId: 'tenant-isolated',
      access: administrator()
    });

    // Proves that repository is queried exactly with the passed tenantId
    // preventing cross-tenant data leakage.
    expect(warehouseRepo.findAllByTenantId).toHaveBeenCalledTimes(1);
    expect(warehouseRepo.findAllByTenantId).toHaveBeenCalledWith('tenant-isolated');
  });
});
