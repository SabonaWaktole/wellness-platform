import { DEFAULT_ROLE_MATRIX } from '../../../../src/access/domain/DefaultRoleMatrix';
import { catalogueEntry } from '../../../../src/access/domain/PermissionCatalogue';
import { PermissionScope } from '../../../../src/access/domain/PermissionScope';
import {
  PERMISSION_UPGRADES,
  baselineRoleMatrix,
  grantsForUpgrade,
  permissionUpgrade,
} from '../../../../src/access/domain/PermissionUpgrades';
import { RoleKey } from '../../../../src/access/domain/RoleKey';

describe('PermissionUpgrades (FR-RBAC-16)', () => {
  const m2 = permissionUpgrade('m2-sales');

  it('FR-RBAC-16 m2-sales adds only the permission keys new in Milestone 2', () => {
    expect([...m2.permissionKeys].sort()).toEqual(
      [
        'activityResults.manage',
        'deals.delete',
        'deals.edit',
        'deals.reopen',
        'deals.view',
        'discounts.apply',
        'discounts.approve',
        'followups.manage',
        'offers.edit',
        'script.edit',
        'script.view',
      ].sort()
    );
  });

  it('every upgraded key exists in the catalogue, and no key is introduced by two upgrades', () => {
    const all = PERMISSION_UPGRADES.flatMap((upgrade) => upgrade.permissionKeys);
    expect(new Set(all).size).toBe(all.length);
    for (const key of all) expect(catalogueEntry(key)).toBeDefined();
  });

  it('FR-RBAC-16 a role receives exactly its default grants for the upgraded keys', () => {
    expect(grantsForUpgrade(m2, RoleKey.SalesManager)).toEqual({
      'deals.delete': PermissionScope.Team,
      'deals.edit': PermissionScope.Team,
      'deals.reopen': PermissionScope.Team,
      'deals.view': PermissionScope.Team,
      'discounts.apply': PermissionScope.Team,
      'discounts.approve': PermissionScope.Team,
      'followups.manage': PermissionScope.Team,
      'offers.edit': PermissionScope.Team,
      'script.view': true,
    });
    expect(grantsForUpgrade(m2, RoleKey.Reception)).toEqual({});
  });

  it('the baseline matrix is the default matrix without any upgraded key', () => {
    const baseline = baselineRoleMatrix();
    for (const roleKey of Object.values(RoleKey)) {
      const withUpgrade = {
        ...baseline[roleKey],
        ...grantsForUpgrade(m2, roleKey),
      };
      expect(withUpgrade).toEqual(DEFAULT_ROLE_MATRIX[roleKey]);
      for (const key of m2.permissionKeys) expect(baseline[roleKey][key]).toBeUndefined();
    }
  });

  it('refuses an unknown upgrade key', () => {
    expect(() => permissionUpgrade('m9-nothing')).toThrow();
  });
});
