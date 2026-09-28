import { ResolveAccessContextUseCase } from '../../../../src/access/application/use-cases/ResolveAccessContextUseCase';
import { InMemoryAccessCache } from '../../../../src/access/infrastructure/InMemoryAccessCache';
import { IAccessRepository, AccessRecord } from '../../../../src/access/application/ports/IAccessRepository';
import { UserNotAccessibleError } from '../../../../src/access/domain/errors';
import { PermissionScope } from '../../../../src/access/domain/PermissionScope';
import { RoleKey } from '../../../../src/access/domain/RoleKey';

function fakeRepository(record: AccessRecord | null): IAccessRepository {
  return { findAccessRecord: jest.fn().mockResolvedValue(record) };
}

const baseRecord: AccessRecord = {
  userId: 'u1',
  tenantId: 't1',
  legacyRole: 'STAFF',
  roleId: 'role-su',
  roleKey: RoleKey.SalesUser,
  isActive: true,
  deletedAt: null,
  grants: { 'companies.view': PermissionScope.Own },
};

describe('ResolveAccessContextUseCase (FR-RBAC-01, enabler for FR-USR-03)', () => {
  it('returns a platform operator for SUPER_ADMIN without touching the repository', async () => {
    const repository = fakeRepository(null);
    const useCase = new ResolveAccessContextUseCase(repository, new InMemoryAccessCache());

    const access = await useCase.execute({ userId: 'sa1', tenantId: null, legacyRole: 'SUPER_ADMIN' });

    expect(access.isPlatformOperator).toBe(true);
    expect(repository.findAccessRecord).not.toHaveBeenCalled();
  });

  it('returns a platform operator while impersonating, even though the token role is BUSINESS_OWNER', async () => {
    const repository = fakeRepository(null);
    const useCase = new ResolveAccessContextUseCase(repository, new InMemoryAccessCache());

    const access = await useCase.execute({
      userId: 'sa1',
      tenantId: 't1',
      legacyRole: 'BUSINESS_OWNER',
      impersonatorId: 'sa1',
    });

    expect(access.isPlatformOperator).toBe(true);
    expect(repository.findAccessRecord).not.toHaveBeenCalled();
  });

  it('FR-USR-04: refuses a deactivated user even with a still-valid token', async () => {
    const repository = fakeRepository({ ...baseRecord, isActive: false });
    const useCase = new ResolveAccessContextUseCase(repository, new InMemoryAccessCache());

    await expect(useCase.execute({ userId: 'u1', tenantId: 't1', legacyRole: 'STAFF' })).rejects.toThrow(
      UserNotAccessibleError
    );
  });

  it('refuses a soft-deleted user', async () => {
    const repository = fakeRepository({ ...baseRecord, deletedAt: new Date() });
    const useCase = new ResolveAccessContextUseCase(repository, new InMemoryAccessCache());

    await expect(useCase.execute({ userId: 'u1', tenantId: 't1', legacyRole: 'STAFF' })).rejects.toThrow(
      UserNotAccessibleError
    );
  });

  it('refuses a user that no longer exists', async () => {
    const repository = fakeRepository(null);
    const useCase = new ResolveAccessContextUseCase(repository, new InMemoryAccessCache());

    await expect(useCase.execute({ userId: 'gone', tenantId: 't1', legacyRole: 'STAFF' })).rejects.toThrow(
      UserNotAccessibleError
    );
  });

  it('uses the role-carried grants when roleId is set', async () => {
    const repository = fakeRepository(baseRecord);
    const useCase = new ResolveAccessContextUseCase(repository, new InMemoryAccessCache());

    const access = await useCase.execute({ userId: 'u1', tenantId: 't1', legacyRole: 'STAFF' });

    expect(access.roleKey).toBe(RoleKey.SalesUser);
    expect(access.scopeOf('companies.view')).toBe(PermissionScope.Own);
  });

  it('D2: falls back to the legacy mapping when roleId is NULL', async () => {
    const repository = fakeRepository({ ...baseRecord, roleId: null, roleKey: null, grants: {}, legacyRole: 'BUSINESS_OWNER' });
    const useCase = new ResolveAccessContextUseCase(repository, new InMemoryAccessCache());

    const access = await useCase.execute({ userId: 'u1', tenantId: 't1', legacyRole: 'BUSINESS_OWNER' });

    expect(access.roleKey).toBe(RoleKey.Administrator);
    expect(access.can('users.manage')).toBe(true);
  });

  it('caches the resolved context so a second call skips the repository', async () => {
    const repository = fakeRepository(baseRecord);
    const cache = new InMemoryAccessCache();
    const useCase = new ResolveAccessContextUseCase(repository, cache);

    await useCase.execute({ userId: 'u1', tenantId: 't1', legacyRole: 'STAFF' });
    await useCase.execute({ userId: 'u1', tenantId: 't1', legacyRole: 'STAFF' });

    expect(repository.findAccessRecord).toHaveBeenCalledTimes(1);
  });

  it('D1: a cleared cache entry causes the next call to hit the repository again', async () => {
    const repository = fakeRepository(baseRecord);
    const cache = new InMemoryAccessCache();
    const useCase = new ResolveAccessContextUseCase(repository, cache);

    await useCase.execute({ userId: 'u1', tenantId: 't1', legacyRole: 'STAFF' });
    cache.userChanged('u1');
    await useCase.execute({ userId: 'u1', tenantId: 't1', legacyRole: 'STAFF' });

    expect(repository.findAccessRecord).toHaveBeenCalledTimes(2);
  });
});
