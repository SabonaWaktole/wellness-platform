import { DEFAULT_ROLE_MATRIX, RoleGrantMap } from './DefaultRoleMatrix';
import { RoleKey } from './RoleKey';

/**
 * A one-time grant of permission keys a later milestone adds to the
 * catalogue, applied once per tenant (D7). The ledger table
 * `AppliedPermissionUpgrade (tenantId, key)` records that it ran, so a key
 * the Administrator revokes afterwards is never put back. An upgrade only
 * inserts its own keys into system roles, at that role's default from
 * `DEFAULT_ROLE_MATRIX`; it never updates or deletes an existing grant, and
 * leaves copied roles to the Administrator.
 *
 * Existing tenants receive it through the generated migration SQL
 * (scripts/generate-role-seed-sql.ts); a new tenant is seeded with the full
 * matrix and gets the ledger row at once (PrismaSystemRoleSeeder).
 */
export interface PermissionUpgrade {
  key: string;
  permissionKeys: readonly string[];
}

export const PERMISSION_UPGRADES: readonly PermissionUpgrade[] = [
  {
    key: 'm2-sales',
    permissionKeys: [
      'script.view',
      'script.edit',
      'deals.view',
      'deals.edit',
      'deals.reopen',
      'deals.delete',
      'offers.edit',
      'discounts.apply',
      'discounts.approve',
      'followups.manage',
      'activityResults.manage',
    ],
  },
  {
    // `payments.view`, `payments.update` and `performance.view` were activated in
    // Milestone 3 but seeded by Milestone 1, so every workspace already holds them;
    // the only key existing workspaces lack is `contracts.terminate` (FR-RBAC-20).
    key: 'm3-contracts-payments',
    permissionKeys: ['contracts.terminate'],
  },
  {
    // The nine Wellness+ keys (FR-RBAC-25, 26). All are new, none is scoped.
    key: 'm4-wellness-plus',
    permissionKeys: [
      'members.view',
      'members.verify',
      'members.manage',
      'members.payments.view',
      'members.payments.record',
      'members.import',
      'members.vip.approve',
      'members.reports.view',
      'wellnessplus.settings.manage',
    ],
  },
];

export function permissionUpgrade(key: string): PermissionUpgrade {
  const upgrade = PERMISSION_UPGRADES.find((candidate) => candidate.key === key);
  if (!upgrade) throw new Error(`Unknown permission upgrade: ${key}`);
  return upgrade;
}

/** The grants `roleKey` receives from `upgrade`: its defaults, restricted to the upgrade's keys. */
export function grantsForUpgrade(upgrade: PermissionUpgrade, roleKey: RoleKey): RoleGrantMap {
  const defaults = DEFAULT_ROLE_MATRIX[roleKey];
  return Object.fromEntries(
    Object.entries(defaults).filter(([permissionKey]) => upgrade.permissionKeys.includes(permissionKey))
  );
}

/**
 * The matrix before any upgrade: what the Milestone 1 migrations seeded.
 * Derived rather than copied, so it cannot drift from `DEFAULT_ROLE_MATRIX`.
 */
export function baselineRoleMatrix(): Readonly<Record<RoleKey, RoleGrantMap>> {
  const upgraded = new Set(PERMISSION_UPGRADES.flatMap((upgrade) => upgrade.permissionKeys));
  return Object.fromEntries(
    Object.values(RoleKey).map((roleKey) => [
      roleKey,
      Object.fromEntries(Object.entries(DEFAULT_ROLE_MATRIX[roleKey]).filter(([key]) => !upgraded.has(key))),
    ])
  ) as Record<RoleKey, RoleGrantMap>;
}
