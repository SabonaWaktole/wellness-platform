import { AccessContext } from './AccessContext';
import { PermissionScope } from './PermissionScope';

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
 */
export function recordScopeFor(
  access: AccessContext,
  key: string,
  teamUserIds: readonly string[]
): RecordScope {
  if (!access.can(key)) {
    return { kind: 'none' };
  }

  switch (access.scopeOf(key)) {
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
