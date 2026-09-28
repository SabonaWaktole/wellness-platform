import { CreateWarehouseUseCase } from './CreateWarehouseUseCase';
import { UpdateWarehouseUseCase } from './UpdateWarehouseUseCase';
import { DeleteWarehouseUseCase } from './DeleteWarehouseUseCase';
import { IWarehouseRepository, IStockLevelRepository } from '../../domain/repositories';
import { Warehouse } from '../../domain/Warehouse';
import { WarehouseInUseError } from '../../domain/inUseErrors';
import { PermissionScope } from '../../../access/domain/PermissionScope';
import { administrator, reception, salesManager, salesUser } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('Warehouse Use Cases (Business Owner only)', () => {
  let warehouseRepo: jest.Mocked<IWarehouseRepository>;
  let stockLevelRepo: jest.Mocked<IStockLevelRepository>;

  beforeEach(() => {
    warehouseRepo = {
      findById: jest.fn(),
      findAllByTenantId: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    stockLevelRepo = {
      findById: jest.fn(),
      findByProductAndWarehouse: jest.fn(),
      findByProductId: jest.fn(),
      save: jest.fn(),
      countByWarehouseId: jest.fn(),
    };
  });

  // ===== CreateWarehouseUseCase =====
  describe('CreateWarehouseUseCase', () => {
    let createUseCase: CreateWarehouseUseCase;

    beforeEach(() => {
      createUseCase = new CreateWarehouseUseCase(warehouseRepo);
    });

    it('should create a warehouse (BUSINESS_OWNER)', async () => {
      const result = await createUseCase.execute({
        tenantId: 'tenant1',
        name: 'Main Hub',
        address: '123 Street',
        access: administrator()
      });

      expect(result.name).toBe('Main Hub');
      expect(result.address).toBe('123 Street');
      expect(warehouseRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should reject STAFF', async () => {
      await expect(createUseCase.execute({
        tenantId: 'tenant1',
        name: 'Main Hub',
        access: salesUser()
      })).rejects.toThrow(PermissionDeniedError);
    });

    it('FR-RBAC-03 allows any role granted inventory.manage at ALL scope', async () => {
      await createUseCase.execute({
        tenantId: 'tenant1',
        name: 'Main Hub',
        access: salesManager({ grant: { 'inventory.manage': PermissionScope.All } })
      });
      expect(warehouseRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should reject SUPER_ADMIN', async () => {
      await expect(createUseCase.execute({
        tenantId: 'tenant1',
        name: 'Main Hub',
        access: reception()
      })).rejects.toThrow(PermissionDeniedError);
    });
  });

  // ===== UpdateWarehouseUseCase =====
  describe('UpdateWarehouseUseCase', () => {
    let updateUseCase: UpdateWarehouseUseCase;

    beforeEach(() => {
      updateUseCase = new UpdateWarehouseUseCase(warehouseRepo);
    });

    it('should update a warehouse (BUSINESS_OWNER)', async () => {
      warehouseRepo.findById.mockResolvedValue(Warehouse.create({
        id: 'w1', tenantId: 'tenant1', name: 'Old Name'
      }));

      const result = await updateUseCase.execute({
        tenantId: 'tenant1',
        id: 'w1',
        name: 'New Name',
        access: administrator()
      });

      expect(result.name).toBe('New Name');
    });

    it('should reject STAFF', async () => {
      await expect(updateUseCase.execute({
        tenantId: 'tenant1',
        id: 'w1',
        name: 'New Name',
        access: salesUser()
      })).rejects.toThrow(PermissionDeniedError);
    });
  });

  // ===== DeleteWarehouseUseCase =====
  describe('DeleteWarehouseUseCase', () => {
    let deleteUseCase: DeleteWarehouseUseCase;

    beforeEach(() => {
      deleteUseCase = new DeleteWarehouseUseCase(warehouseRepo, stockLevelRepo);
    });

    it('should delete a warehouse with zero stock levels (BUSINESS_OWNER)', async () => {
      warehouseRepo.findById.mockResolvedValue(Warehouse.create({
        id: 'w1', tenantId: 'tenant1', name: 'Empty Hub'
      }));
      stockLevelRepo.countByWarehouseId.mockResolvedValue(0);

      await deleteUseCase.execute({
        tenantId: 'tenant1',
        id: 'w1',
        access: administrator()
      });

      expect(warehouseRepo.delete).toHaveBeenCalledWith('tenant1', 'w1');
    });

    it('should block deletion when warehouse has stock levels (WarehouseInUseError)', async () => {
      warehouseRepo.findById.mockResolvedValue(Warehouse.create({
        id: 'w1', tenantId: 'tenant1', name: 'Full Hub'
      }));
      stockLevelRepo.countByWarehouseId.mockResolvedValue(3); // Has stock

      await expect(deleteUseCase.execute({
        tenantId: 'tenant1',
        id: 'w1',
        access: administrator()
      })).rejects.toThrow(WarehouseInUseError);

      // Confirm delete was NEVER called
      expect(warehouseRepo.delete).not.toHaveBeenCalled();
    });

    it('should reject STAFF', async () => {
      await expect(deleteUseCase.execute({
        tenantId: 'tenant1',
        id: 'w1',
        access: salesUser()
      })).rejects.toThrow(PermissionDeniedError);
    });

    it('should reject SUPER_ADMIN', async () => {
      await expect(deleteUseCase.execute({
        tenantId: 'tenant1',
        id: 'w1',
        access: reception()
      })).rejects.toThrow(PermissionDeniedError);
    });
  });
});
