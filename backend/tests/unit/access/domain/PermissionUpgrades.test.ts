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
        ...PERMISSION_UPGRADES.reduce((all, upgrade) => ({ ...all, ...grantsForUpgrade(upgrade, roleKey) }), {}),
      };
      expect(withUpgrade).toEqual(DEFAULT_ROLE_MATRIX[roleKey]);
      for (const key of PERMISSION_UPGRADES.flatMap((upgrade) => upgrade.permissionKeys)) {
        expect(baseline[roleKey][key]).toBeUndefined();
      }
    }
  });

  it('FR-RBAC-20 m3-contracts-payments adds only the key existing workspaces lack, at the §7.2 default', () => {
    const m3 = permissionUpgrade('m3-contracts-payments');
    expect(m3.permissionKeys).toEqual(['contracts.terminate']);
    expect(grantsForUpgrade(m3, RoleKey.SalesManager)).toEqual({ 'contracts.terminate': PermissionScope.Team });
    expect(grantsForUpgrade(m3, RoleKey.Administrator)).toEqual({ 'contracts.terminate': PermissionScope.All });
    for (const roleKey of [RoleKey.SalesUser, RoleKey.Reception, RoleKey.Ceo]) {
      expect(grantsForUpgrade(m3, roleKey)).toEqual({});
    }
  });

  it('refuses an unknown upgrade key', () => {
    expect(() => permissionUpgrade('m9-nothing')).toThrow();
  });
});
