import { GetTenantStaffUseCase } from '@auth/application/use-cases/GetTenantStaffUseCase';
import { UserRole } from '@auth/domain/enums/UserRole';
import { makeRoleCatalogue, makeUser, makeUserRepository } from '../../../../support/fakeUserAdmin';

describe('GetTenantStaffUseCase', () => {
  const setup = (users: ReturnType<typeof makeUser>[]) => {
    const userRepository = makeUserRepository(users);
    return { userRepository, useCase: new GetTenantStaffUseCase(userRepository, makeRoleCatalogue()) };
  };

  it('FR-USR-02 lists each member with their role\'s key and both labels', async () => {
    const { userRepository, useCase } = setup([
      makeUser({ id: '1', email: 'a@test.com', firstName: 'Ana', roleId: 'role-RECEPTION' }),
    ]);

    const result = await useCase.execute({ tenantId: 'tenant1' });

    expect(userRepository.findByTenantId).toHaveBeenCalledWith('tenant1');
    expect(result.items).toEqual([
      {
        id: '1',
        email: 'a@test.com',
        firstName: 'Ana',
        lastName: null,
        role: UserRole.STAFF,
        roleId: 'role-RECEPTION',
        roleKey: 'RECEPTION',
        roleNameSq: 'Recepsion',
        roleNameEn: 'Reception',
        warehouseId: null,
        isActive: true,
      },
    ]);
  });

  it('names a legacy member\'s role through D2 when they have no roleId yet', async () => {
    const { useCase } = setup([makeUser({ id: '2', role: UserRole.BUSINESS_OWNER, roleId: null })]);

    const [member] = (await useCase.execute({ tenantId: 'tenant1' })).items;

    expect(member).toMatchObject({ roleId: 'role-ADMINISTRATOR', roleKey: 'ADMINISTRATOR', roleNameEn: 'Administrator' });
  });

  it('throws when tenantId is missing', async () => {
    const { useCase } = setup([]);
    await expect(useCase.execute({ tenantId: '' })).rejects.toThrow('Tenant ID is required');
  });
});
