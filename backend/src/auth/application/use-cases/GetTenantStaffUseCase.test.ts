import { GetTenantStaffUseCase } from './GetTenantStaffUseCase';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { UserRole } from '../../domain/enums/UserRole';

describe('GetTenantStaffUseCase', () => {
  let useCase: GetTenantStaffUseCase;
  let userRepositoryMock: jest.Mocked<IUserRepository>;

  beforeEach(() => {
    userRepositoryMock = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findAnyByEmail: jest.fn(),
      findSuperAdminByEmail: jest.fn(),
      create: jest.fn(),
      updatePassword: jest.fn(),
      updateProfile: jest.fn(),
      findByTenantId: jest.fn(),
      updateRoleAndWarehouse: jest.fn(),
      setActive: jest.fn(),
      softDelete: jest.fn(),
      countAssignedWork: jest.fn(),
      findActiveByTenantAndRole: jest.fn().mockResolvedValue([]),
      findPlatformUsers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      countActivePlatformAdmins: jest.fn().mockResolvedValue(1),
    };
    useCase = new GetTenantStaffUseCase(userRepositoryMock);
  });

  it('should return staff members for a valid tenantId', async () => {
    const mockUsers = [
      { id: '1', email: 'test1@test.com', tenantId: 'tenant1', role: UserRole.STAFF, createdAt: new Date(), hashedPassword: 'hash' } as any,
      { id: '2', email: 'test2@test.com', tenantId: 'tenant1', role: UserRole.BUSINESS_OWNER, createdAt: new Date(), hashedPassword: 'hash' } as any,
    ];
    userRepositoryMock.findByTenantId.mockResolvedValue(mockUsers);

    const result = await useCase.execute({ tenantId: 'tenant1' });

    expect(userRepositoryMock.findByTenantId).toHaveBeenCalledWith('tenant1');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      id: '1',
      email: 'test1@test.com',
      role: UserRole.STAFF
    });
  });

  it('should throw an error if tenantId is missing', async () => {
    await expect(useCase.execute({ tenantId: '' })).rejects.toThrow('Tenant ID is required');
  });
});
