import { AuditChange } from '../../audit/domain/AuditChange';
import { RoleGrantMap, PermissionGrant } from './DefaultRoleMatrix';
import { catalogueEntry } from './PermissionCatalogue';
import { PermissionScope } from './PermissionScope';
import { InvalidPermissionGrantError } from './errors';

/** One row of a role's permission grid as the admin screen submits it: `scope` is null for a plain capability. */
export interface GrantInput {
  key: string;
  scope: PermissionScope | null;
}

const SCOPES = new Set<string>(Object.values(PermissionScope));

/**
 * Validates a submitted permission set against the in-code catalogue
 * (FR-RBAC-02, 03) and returns it as a grant map. Keys tagged M2/M3 are
 * accepted: the SRS defines them now so they can be configured now.
 */
export function toGrantMap(inputs: GrantInput[]): RoleGrantMap {
  const grants: Record<string, PermissionGrant> = {};
  for (const { key, scope } of inputs) {
    const entry = catalogueEntry(key);
    if (!entry) {
      throw new InvalidPermissionGrantError(key, `"${key}" is not a permission.`);
    }
    if (grants[key] !== undefined) {
      throw new InvalidPermissionGrantError(key, `"${key}" is listed more than once.`);
    }
    if (entry.supportsScope) {
      if (scope === null || !SCOPES.has(scope)) {
        throw new InvalidPermissionGrantError(key, `"${key}" needs a scope: Own, Team or All.`);
      }
      grants[key] = scope;
    } else {
      if (scope !== null) {
        throw new InvalidPermissionGrantError(key, `"${key}" does not take a scope.`);
      }
      grants[key] = true;
    }
  }
  return grants;
}

export interface GrantComparison {
  added: string[];
  removed: string[];
  /** Held on both sides, at a different scope. */
  rescoped: string[];
}

/** What changed between two grant maps, each list sorted by key. */
export function compareGrants(before: RoleGrantMap, after: RoleGrantMap): GrantComparison {
  const added = Object.keys(after).filter((key) => before[key] === undefined).sort();
  const removed = Object.keys(before).filter((key) => after[key] === undefined).sort();
  const rescoped = Object.keys(after)
    .filter((key) => before[key] !== undefined && before[key] !== after[key])
    .sort();
  return { added, removed, rescoped };
}

function sorted(grants: RoleGrantMap, keys: string[] = Object.keys(grants)): Record<string, PermissionGrant> {
  return Object.fromEntries([...keys].sort().map((key) => [key, grants[key]]));
}

/**
 * The audit changes for one save of a role's permissions (FR-RBAC-10): the
 * old and new permission set, then the keys added, removed and re-scoped.
 * Empty when the save changed nothing.
 */
export function permissionSetChanges(before: RoleGrantMap, after: RoleGrantMap): AuditChange[] {
  const { added, removed, rescoped } = compareGrants(before, after);
  if (added.length + removed.length + rescoped.length === 0) {
    return [];
  }

  const changes: AuditChange[] = [{ field: 'permissions', old: sorted(before), new: sorted(after) }];
  if (added.length > 0) {
    changes.push({ field: 'permissionsAdded', old: null, new: added });
  }
  if (removed.length > 0) {
    changes.push({ field: 'permissionsRemoved', old: removed, new: null });
  }
  if (rescoped.length > 0) {
    changes.push({ field: 'scopesChanged', old: sorted(before, rescoped), new: sorted(after, rescoped) });
  }
  return changes;
}
