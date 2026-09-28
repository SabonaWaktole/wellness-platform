import { DEFAULT_ROLE_MATRIX } from '../../../../src/access/domain/DefaultRoleMatrix';
import { PERMISSION_CATALOGUE, catalogueEntry } from '../../../../src/access/domain/PermissionCatalogue';
import { PermissionScope } from '../../../../src/access/domain/PermissionScope';
import { RoleKey } from '../../../../src/access/domain/RoleKey';

describe('PermissionCatalogue', () => {
  it('has no duplicate keys', () => {
    const keys = PERMISSION_CATALOGUE.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('DEFAULT_ROLE_MATRIX (SRS §4.2)', () => {
  it('seeds exactly the five system roles', () => {
    expect(Object.keys(DEFAULT_ROLE_MATRIX).sort()).toEqual(
      [RoleKey.SalesUser, RoleKey.SalesManager, RoleKey.Reception, RoleKey.Administrator, RoleKey.Ceo].sort()
    );
  });

  it('FR-RBAC-02 every granted key exists in the catalogue', () => {
    for (const [roleKey, grants] of Object.entries(DEFAULT_ROLE_MATRIX)) {
      for (const permissionKey of Object.keys(grants)) {
        expect(catalogueEntry(permissionKey)).toBeDefined();
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      void roleKey;
    }
  });

  it('a scoped permission is always granted with a scope, and a plain one with true', () => {
    for (const grants of Object.values(DEFAULT_ROLE_MATRIX)) {
      for (const [permissionKey, grant] of Object.entries(grants)) {
        const entry = catalogueEntry(permissionKey)!;
        if (entry.supportsScope) {
          expect(Object.values(PermissionScope)).toContain(grant);
        } else {
          expect(grant).toBe(true);
        }
      }
    }
  });

  it('D3: Reception gets notes.view/notes.add at ALL with no activities.* and no commercial/payments access', () => {
    const reception = DEFAULT_ROLE_MATRIX[RoleKey.Reception];
    expect(reception['notes.view']).toBe(PermissionScope.All);
    expect(reception['notes.add']).toBe(PermissionScope.All);
    expect(reception['activities.view']).toBeUndefined();
    expect(reception['activities.add']).toBeUndefined();
    expect(reception['commercial.view']).toBeUndefined();
    expect(reception['payments.view']).toBeUndefined();
  });

  it('FR-RBAC-09: global visibility and settings management are separate for the CEO', () => {
    const ceo = DEFAULT_ROLE_MATRIX[RoleKey.Ceo];
    expect(ceo['companies.view']).toBe(PermissionScope.All);
    expect(ceo['settings.manage']).toBeUndefined();
  });

  it('D8: module permissions default to the Administrator only', () => {
    for (const roleKey of [RoleKey.SalesManager, RoleKey.Reception, RoleKey.Ceo]) {
      const grants = DEFAULT_ROLE_MATRIX[roleKey];
      expect(grants['inventory.manage']).toBeUndefined();
      expect(grants['forms.manage']).toBeUndefined();
      expect(grants['integrations.manage']).toBeUndefined();
      expect(grants['reports.view']).toBeUndefined();
    }
    expect(DEFAULT_ROLE_MATRIX[RoleKey.Administrator]['inventory.manage']).toBe(PermissionScope.All);
  });

  it('deviation: Sales User keeps inventory.manage at OWN, so legacy STAFF do not lose inventory on rollout', () => {
    expect(DEFAULT_ROLE_MATRIX[RoleKey.SalesUser]['inventory.manage']).toBe(PermissionScope.Own);
    // Still Admin-only for the other D8 module keys.
    expect(DEFAULT_ROLE_MATRIX[RoleKey.SalesUser]['forms.manage']).toBeUndefined();
    expect(DEFAULT_ROLE_MATRIX[RoleKey.SalesUser]['integrations.manage']).toBeUndefined();
    expect(DEFAULT_ROLE_MATRIX[RoleKey.SalesUser]['reports.view']).toBeUndefined();
  });
});
