import { AccessContext } from '../../../../src/access/domain/AccessContext';
import { PermissionScope } from '../../../../src/access/domain/PermissionScope';
import { PERMISSION_CATALOGUE } from '../../../../src/access/domain/PermissionCatalogue';
import { RoleKey } from '../../../../src/access/domain/RoleKey';

describe('AccessContext', () => {
  it('FR-RBAC-05 can() is true only for a held key', () => {
    const access = new AccessContext({
      userId: 'u1',
      tenantId: 't1',
      roleKey: RoleKey.SalesUser,
      permissions: { 'companies.view': PermissionScope.Own },
      isPlatformOperator: false,
    });

    expect(access.can('companies.view')).toBe(true);
    expect(access.can('companies.delete')).toBe(false);
  });

  it('FR-RBAC-03 scopeOf() returns the granted scope for a scoped permission', () => {
    const access = new AccessContext({
      userId: 'u1',
      tenantId: 't1',
      roleKey: RoleKey.SalesManager,
      permissions: { 'companies.view': PermissionScope.Team },
      isPlatformOperator: false,
    });

    expect(access.scopeOf('companies.view')).toBe(PermissionScope.Team);
  });

  it('scopeOf() returns null for an unheld key and for a plain capability', () => {
    const access = new AccessContext({
      userId: 'u1',
      tenantId: 't1',
      roleKey: RoleKey.Administrator,
      permissions: { 'users.manage': true },
      isPlatformOperator: false,
    });

    expect(access.scopeOf('users.manage')).toBeNull();
    expect(access.scopeOf('companies.view')).toBeNull();
  });

  it('platformOperator() holds every catalogue key at its widest grant', () => {
    const access = AccessContext.platformOperator('sa1', 't1');

    for (const entry of PERMISSION_CATALOGUE) {
      expect(access.can(entry.key)).toBe(true);
      if (entry.supportsScope) {
        expect(access.scopeOf(entry.key)).toBe(PermissionScope.All);
      }
    }
    expect(access.isPlatformOperator).toBe(true);
  });

  it('FR-USR-03 version changes when the grants change and is stable otherwise', () => {
    const a = new AccessContext({
      userId: 'u1',
      tenantId: 't1',
      roleKey: RoleKey.SalesUser,
      permissions: { 'companies.view': PermissionScope.Own },
      isPlatformOperator: false,
    });
    const same = new AccessContext({
      userId: 'u1',
      tenantId: 't1',
      roleKey: RoleKey.SalesUser,
      permissions: { 'companies.view': PermissionScope.Own },
      isPlatformOperator: false,
    });
    const changed = new AccessContext({
      userId: 'u1',
      tenantId: 't1',
      roleKey: RoleKey.SalesUser,
      permissions: { 'companies.view': PermissionScope.Team },
      isPlatformOperator: false,
    });

    expect(a.version).toBe(same.version);
    expect(a.version).not.toBe(changed.version);
  });

  it('toJSON() returns the raw grant map', () => {
    const access = new AccessContext({
      userId: 'u1',
      tenantId: 't1',
      roleKey: RoleKey.Administrator,
      permissions: { 'users.manage': true, 'companies.view': PermissionScope.All },
      isPlatformOperator: false,
    });

    expect(access.toJSON()).toEqual({ 'users.manage': true, 'companies.view': PermissionScope.All });
  });
});
