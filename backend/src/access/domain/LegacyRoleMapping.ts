import { RoleKey } from './RoleKey';

/**
 * D2: how a pre-Slice-3 `User.role` string maps onto the new role keys, for
 * the migration's backfill and for `ResolveAccessContextUseCase`'s fallback
 * when `User.roleId` is NULL (any user created or left over before this
 * migration ran). `SUPER_ADMIN` has no entry: it stays outside the role
 * table entirely and always resolves to `AccessContext.platformOperator()`.
 */
const LEGACY_TO_ROLE_KEY: Readonly<Record<'BUSINESS_OWNER' | 'STAFF', RoleKey>> = {
  BUSINESS_OWNER: RoleKey.Administrator,
  STAFF: RoleKey.SalesUser,
};

/** The `RoleKey` a legacy `role` string maps to, or `null` for SUPER_ADMIN. */
export function legacyRoleKeyFor(role: string): RoleKey | null {
  if (role === 'BUSINESS_OWNER' || role === 'STAFF') {
    return LEGACY_TO_ROLE_KEY[role];
  }
  return null;
}

/**
 * The legacy `User.role` string written alongside a `roleId` (the reverse of
 * D2), so the rollback path and code still reading the string stay correct.
 * Only the Administrator was a BUSINESS_OWNER; every other role was STAFF.
 */
export function legacyRoleFor(roleKey: string): 'BUSINESS_OWNER' | 'STAFF' {
  return roleKey === RoleKey.Administrator ? 'BUSINESS_OWNER' : 'STAFF';
}
