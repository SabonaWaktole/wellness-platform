import { AccessContext } from './AccessContext';
import { PermissionScope, scopeAtLeast } from './PermissionScope';

/**
 * Which records one scoped permission reaches (FR-RBAC-11, 12), expressed as
 * data a repository turns into a WHERE clause — so counts and pagination stay
 * right (FR-RBAC-13), never as a filter applied after loading.
 *
 * "Owner" is whichever user a record answers to: a company's assignee, an
 * appointment's assignee, and — through their company — its contracts,
 * quotations and invoices. Tenant isolation sits underneath, unchanged.
 */
export type RecordScope =
  | { kind: 'all' }
  | { kind: 'owners'; userIds: readonly string[]; includeUnowned: boolean }
  | { kind: 'none' };

export const ALL_RECORDS: RecordScope = { kind: 'all' };

/**
 * Turns `access`'s grant of `key` into a `RecordScope`.
 *
 *   OWN  → records owned by the viewer.
 *   TEAM → records owned by any Sales User or by the viewer, plus records
 *          owned by no one (D4: one sales team, and the manager's own book).
 *   ALL  → every record.
 *   not held → no record at all.
 *
 * `teamUserIds` is the tenant's Sales Users; it is only read for TEAM.
 * `narrowTo` asks for less than the grant (a list's "mine" / "team" filter);
 * it never widens past it.
 */
export function recordScopeFor(
  access: AccessContext,
  key: string,
  teamUserIds: readonly string[],
  narrowTo?: PermissionScope
): RecordScope {
  if (!access.can(key)) {
    return { kind: 'none' };
  }

  switch (effectiveScope(access.scopeOf(key), narrowTo)) {
    case PermissionScope.Own:
      return { kind: 'owners', userIds: [access.userId], includeUnowned: false };
    case PermissionScope.Team:
      return {
        kind: 'owners',
        userIds: [...new Set([...teamUserIds, access.userId])],
        includeUnowned: true,
      };
    default:
      // ALL, or a plain capability held without a scope.
      return { kind: 'all' };
  }
}

/** The narrower of the grant and the request. A plain capability counts as ALL. */
export function effectiveScope(granted: PermissionScope | null, narrowTo?: PermissionScope): PermissionScope {
  const grant = granted ?? PermissionScope.All;
  return narrowTo && scopeAtLeast(grant, narrowTo) ? narrowTo : grant;
}

/** True when a record owned by `ownerId` (or by no one, `null`) is inside `scope`. */
export function admits(scope: RecordScope, ownerId: string | null | undefined): boolean {
  switch (scope.kind) {
    case 'all':
      return true;
    case 'none':
      return false;
    case 'owners':
      return ownerId ? scope.userIds.includes(ownerId) : scope.includeUnowned;
  }
}
