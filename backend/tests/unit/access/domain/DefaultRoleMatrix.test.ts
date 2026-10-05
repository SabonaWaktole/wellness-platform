import { DEFAULT_ROLE_MATRIX } from '../../../../src/access/domain/DefaultRoleMatrix';
import { PERMISSION_CATALOGUE, catalogueEntry } from '../../../../src/access/domain/PermissionCatalogue';
import { PermissionScope } from '../../../../src/access/domain/PermissionScope';
import { RoleKey } from '../../../../src/access/domain/RoleKey';

describe('PermissionCatalogue', () => {
  it('has no duplicate keys', () => {
    const keys = PERMISSION_CATALOGUE.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('FR-RBAC-15 lists every Milestone 2 sales permission under the "sales" group, scoped as §9.1 says', () => {
    const sales = PERMISSION_CATALOGUE.filter((entry) => entry.group === 'sales');
    expect(sales.map(({ key, supportsScope, milestone }) => ({ key, supportsScope, milestone }))).toEqual([
      { key: 'script.view', supportsScope: false, milestone: 'M2' },
      { key: 'script.edit', supportsScope: false, milestone: 'M2' },
      { key: 'deals.view', supportsScope: true, milestone: 'M2' },
      { key: 'deals.edit', supportsScope: true, milestone: 'M2' },
      { key: 'deals.reopen', supportsScope: true, milestone: 'M2' },
      { key: 'deals.delete', supportsScope: true, milestone: 'M2' },
      { key: 'offers.edit', supportsScope: true, milestone: 'M2' },
      { key: 'commercial.view', supportsScope: true, milestone: 'M2' },
      { key: 'discounts.apply', supportsScope: true, milestone: 'M2' },
      { key: 'discounts.approve', supportsScope: true, milestone: 'M2' },
      { key: 'pricing.manage', supportsScope: false, milestone: 'M2' },
      { key: 'followups.manage', supportsScope: true, milestone: 'M2' },
      { key: 'activityResults.manage', supportsScope: false, milestone: 'M2' },
    ]);
  });
});

describe('Milestone 3 contracts and payments permissions (FR-RBAC-19)', () => {
  it('FR-RBAC-19 adds contracts.terminate under Contracts, scoped', () => {
    expect(catalogueEntry('contracts.terminate')).toEqual({ key: 'contracts.terminate', group: 'contracts', supportsScope: true });
  });

  it('FR-RBAC-19 payments.view, payments.update and performance.view are no longer tagged Milestone 3', () => {
    for (const key of ['payments.view', 'payments.update', 'performance.view']) {
      expect(catalogueEntry(key)).toBeDefined();
      expect(catalogueEntry(key)!.milestone).toBeUndefined();
    }
    expect(PERMISSION_CATALOGUE.filter((entry) => entry.milestone === 'M3')).toEqual([]);
  });

  it('FR-RBAC-20 the §7.2 defaults for contracts, payments and performance', () => {
    const { Own, Team, All } = PermissionScope;
    const rowOf = (key: string) =>
      Object.fromEntries(Object.entries(DEFAULT_ROLE_MATRIX).map(([role, grants]) => [role, grants[key]]));
    expect(rowOf('contracts.terminate')).toEqual({
      [RoleKey.SalesUser]: undefined, [RoleKey.SalesManager]: Team, [RoleKey.Reception]: undefined,
      [RoleKey.Administrator]: All, [RoleKey.Ceo]: undefined,
    });
    expect(rowOf('contracts.validity.view')).toEqual({
      [RoleKey.SalesUser]: Own, [RoleKey.SalesManager]: Team, [RoleKey.Reception]: All,
      [RoleKey.Administrator]: All, [RoleKey.Ceo]: All,
    });
    expect(rowOf('contracts.manage')).toEqual({
      [RoleKey.SalesUser]: Own, [RoleKey.SalesManager]: Team, [RoleKey.Reception]: undefined,
      [RoleKey.Administrator]: All, [RoleKey.Ceo]: undefined,
    });
    expect(rowOf('payments.view')).toEqual({
      [RoleKey.SalesUser]: Own, [RoleKey.SalesManager]: Team, [RoleKey.Reception]: undefined,
      [RoleKey.Administrator]: All, [RoleKey.Ceo]: All,
    });
    // Q3: payments.update is the Administrator's alone.
    expect(rowOf('payments.update')).toEqual({
      [RoleKey.SalesUser]: undefined, [RoleKey.SalesManager]: undefined, [RoleKey.Reception]: undefined,
      [RoleKey.Administrator]: true, [RoleKey.Ceo]: undefined,
    });
    // The Administrator has no performance view.
    expect(rowOf('performance.view')).toEqual({
      [RoleKey.SalesUser]: Own, [RoleKey.SalesManager]: Team, [RoleKey.Reception]: undefined,
      [RoleKey.Administrator]: undefined, [RoleKey.Ceo]: All,
    });
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

  const { Own, Team, All } = PermissionScope;
  const SALES_MATRIX: Record<string, Partial<Record<RoleKey, PermissionScope | true>>> = {
    'script.view': { SALES_USER: true, SALES_MANAGER: true, ADMINISTRATOR: true, CEO: true },
    'script.edit': { ADMINISTRATOR: true },
    'deals.view': { SALES_USER: Own, SALES_MANAGER: Team, ADMINISTRATOR: All, CEO: All },
    'deals.edit': { SALES_USER: Own, SALES_MANAGER: Team, ADMINISTRATOR: All },
    'deals.reopen': { SALES_MANAGER: Team, ADMINISTRATOR: All },
    'deals.delete': { SALES_MANAGER: Team, ADMINISTRATOR: All },
    'offers.edit': { SALES_USER: Own, SALES_MANAGER: Team, ADMINISTRATOR: All },
    'commercial.view': { SALES_USER: Own, SALES_MANAGER: Team, ADMINISTRATOR: All, CEO: All },
    'discounts.apply': { SALES_USER: Own, SALES_MANAGER: Team, ADMINISTRATOR: All },
    'discounts.approve': { SALES_MANAGER: Team, CEO: All },
    'pricing.manage': { ADMINISTRATOR: true },
    'followups.manage': { SALES_USER: Own, SALES_MANAGER: Team, ADMINISTRATOR: All },
    'activityResults.manage': { ADMINISTRATOR: true },
  };

  it.each(Object.entries(SALES_MATRIX))('FR-RBAC-16 %s has the SRS §9.2 default for every role', (permissionKey, expected) => {
    for (const roleKey of Object.values(RoleKey)) {
      expect([roleKey, DEFAULT_ROLE_MATRIX[roleKey][permissionKey]]).toEqual([roleKey, expected[roleKey]]);
    }
  });

  it('Q8: the CEO approves discounts above the cap and the Administrator, who manages the rules, does not', () => {
    expect(DEFAULT_ROLE_MATRIX[RoleKey.Ceo]['discounts.approve']).toBe(All);
    expect(DEFAULT_ROLE_MATRIX[RoleKey.Administrator]['discounts.approve']).toBeUndefined();
  });

  it('deviation: Sales User keeps inventory.manage at OWN, so legacy STAFF do not lose inventory on rollout', () => {
    expect(DEFAULT_ROLE_MATRIX[RoleKey.SalesUser]['inventory.manage']).toBe(PermissionScope.Own);
    // Still Admin-only for the other D8 module keys.
    expect(DEFAULT_ROLE_MATRIX[RoleKey.SalesUser]['forms.manage']).toBeUndefined();
    expect(DEFAULT_ROLE_MATRIX[RoleKey.SalesUser]['integrations.manage']).toBeUndefined();
    expect(DEFAULT_ROLE_MATRIX[RoleKey.SalesUser]['reports.view']).toBeUndefined();
  });
});
