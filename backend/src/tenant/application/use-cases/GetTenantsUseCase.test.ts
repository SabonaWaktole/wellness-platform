import { GetTenantsUseCase } from './GetTenantsUseCase';
import { ITenantRepository } from '../../domain/repositories/ITenantRepository';
import { Tenant } from '../../domain/entities/Tenant';
import { UnauthorizedError } from '../../../auth/domain/errors';
import { UserRole } from '../../../auth/domain/enums/UserRole';

describe('GetTenantsUseCase', () => {
  let useCase: GetTenantsUseCase;
  let mockTenantRepo: jest.Mocked<ITenantRepository>;

  beforeEach(() => {
    mockTenantRepo = {
      findById: jest.fn(),
      findBySlug: jest.fn(),
      create: jest.fn(),
      findAll: jest.fn(),
      updateSettings: jest.fn(),
      updateSettingsForMany: jest.fn(),
      setSubscriptionStatus: jest.fn(),
      setSalesWorkflow: jest.fn(),
    };
    useCase = new GetTenantsUseCase(mockTenantRepo);
  });

  it('should throw UnauthorizedError if caller is BUSINESS_OWNER and never access data', async () => {
    await expect(
      useCase.execute({ callerRole: UserRole.BUSINESS_OWNER })
    ).rejects.toThrow(UnauthorizedError);
    expect(mockTenantRepo.findAll).not.toHaveBeenCalled();
  });

  it('should throw UnauthorizedError if caller is STAFF and never access data', async () => {
    await expect(
      useCase.execute({ callerRole: UserRole.STAFF })
    ).rejects.toThrow(UnauthorizedError);
    expect(mockTenantRepo.findAll).not.toHaveBeenCalled();
  });

  it('should return tenants and total count for SUPER_ADMIN', async () => {
    const mockTenants = [
      Tenant.create({ id: 't1', name: 'Tenant 1', urlSlug: 't1', createdAt: new Date() }),
      Tenant.create({ id: 't2', name: 'Tenant 2', urlSlug: 't2', createdAt: new Date() }),
    ];

    mockTenantRepo.findAll.mockResolvedValue({ items: mockTenants, total: 2 });

    const result = await useCase.execute({ callerRole: UserRole.SUPER_ADMIN, skip: 0, take: 10 });

    expect(mockTenantRepo.findAll).toHaveBeenCalledWith(0, 10);
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('should use default skip and take if not provided', async () => {
    mockTenantRepo.findAll.mockResolvedValue({ items: [], total: 0 });

    await useCase.execute({ callerRole: UserRole.SUPER_ADMIN });

    expect(mockTenantRepo.findAll).toHaveBeenCalledWith(0, 50);
  });
});
