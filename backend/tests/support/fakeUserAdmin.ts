import { IUserRepository } from '../../src/auth/domain/repositories/IUserRepository';
import { User } from '../../src/auth/domain/entities/User';
import { UserRole } from '../../src/auth/domain/enums/UserRole';
import { IRoleCatalogue, RoleSummary } from '../../src/access/application/ports/IRoleCatalogue';
import { DEFAULT_ROLE_MATRIX } from '../../src/access/domain/DefaultRoleMatrix';
import { RoleKey, SYSTEM_ROLE_NAMES } from '../../src/access/domain/RoleKey';

/** A tenant user for use-case tests; `roleId` defaults to the tenant's Sales User role. */
export const makeUser = (overrides: Partial<Parameters<typeof User.create>[0]> = {}) =>
  User.create({
    id: 'u1',
    email: 'staff@tenant1.test',
    hashedPassword: 'hash',
    role: UserRole.STAFF,
    roleId: `role-${RoleKey.SalesUser}`,
    tenantId: 'tenant1',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });

/** Every `IUserRepository` method as a jest.fn(), with `findById` answering from `users`. */
export function makeUserRepository(users: User[] = []): jest.Mocked<IUserRepository> {
  return {
    findById: jest.fn().mockImplementation(async (id: string) => users.find((u) => u.id === id) ?? null),
    findByEmail: jest.fn().mockResolvedValue(null),
    findAnyByEmail: jest.fn(),
    findSuperAdminByEmail: jest.fn(),
    findByTenantId: jest.fn().mockResolvedValue(users),
    findActiveByTenantAndRole: jest.fn().mockResolvedValue([]),
    findPlatformUsers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    countActivePlatformAdmins: jest.fn().mockResolvedValue(1),
    create: jest.fn(),
    updatePassword: jest.fn(),
    updateProfile: jest.fn(),
    setActive: jest.fn(),
    softDelete: jest.fn(),
    countAssignedWork: jest.fn().mockResolvedValue({ clients: 0, upcomingAppointments: 0, openContracts: 0, companies: [] }),
  } as unknown as jest.Mocked<IUserRepository>;
}

/** The five system roles of 'tenant1', with ids `role-<KEY>`, as `IRoleCatalogue` returns them. */
export const systemRoles = (): RoleSummary[] =>
  Object.values(RoleKey).map((key) => ({
    id: `role-${key}`,
    key,
    ...SYSTEM_ROLE_NAMES[key],
    isSystem: true,
    baseKey: null,
    grants: DEFAULT_ROLE_MATRIX[key],
  }));

export function makeRoleCatalogue(
  roles: RoleSummary[] = systemRoles(),
  roleManagers: string[] = ['admin', 'second-admin']
): jest.Mocked<IRoleCatalogue> {
  return {
    list: jest.fn().mockResolvedValue(roles),
    findById: jest.fn().mockImplementation(async (tenantId: string, roleId: string) =>
      tenantId === 'tenant1' ? roles.find((role) => role.id === roleId) ?? null : null
    ),
    activeHolderIds: jest.fn().mockResolvedValue(roleManagers),
    usage: jest.fn().mockResolvedValue({ users: 0, invitations: 0 }),
  };
}
