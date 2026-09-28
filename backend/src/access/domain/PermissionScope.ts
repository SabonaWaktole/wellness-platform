/**
 * How far a scoped permission reaches (FR-RBAC-03, 11..13). `RecordScope`
 * turns it into a repository filter: OWN is "assigned to me", TEAM is Sales
 * Users plus me plus unassigned (D4), ALL is no filter.
 */
export enum PermissionScope {
  Own = 'OWN',
  Team = 'TEAM',
  All = 'ALL',
}

/** Scopes ordered from narrowest to widest, for comparisons like "at least Team". */
const SCOPE_ORDER: readonly PermissionScope[] = [PermissionScope.Own, PermissionScope.Team, PermissionScope.All];

/** True when `scope` reaches at least as far as `atLeast`. */
export function scopeAtLeast(scope: PermissionScope | null, atLeast: PermissionScope): boolean {
  if (scope === null) {
    return false;
  }
  return SCOPE_ORDER.indexOf(scope) >= SCOPE_ORDER.indexOf(atLeast);
}
