/**
 * How far a scoped permission reaches (FR-RBAC-03). `OWN` and `TEAM` are
 * interim in Slice 3: every repository still returns unfiltered results for
 * `TEAM` and `ALL` alike until Slice 4 adds the real data-scope filter
 * (FR-RBAC-11..13). `OWN` is enforced from this slice on, because it maps
 * onto filters ("created by me", "assigned to me", "my warehouse") that
 * already exist in the codebase.
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
