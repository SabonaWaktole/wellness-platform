import { RecordScope } from '../domain/RecordScope';

/**
 * The Prisma `where` fragment for `scope` over the owner column `field`
 * (FR-RBAC-13: filter in the query, never after loading). Put it in an `AND`
 * array beside the caller's own conditions — it may carry its own `OR` — or
 * under a relation, e.g. `{ client: ownerWhere(scope, 'assignedUserId') }`.
 */
export function ownerWhere(scope: RecordScope, field: string): Record<string, unknown> {
  switch (scope.kind) {
    case 'all':
      return {};
    case 'none':
      return { id: { in: [] } };
    case 'owners': {
      const owned = { [field]: { in: [...scope.userIds] } };
      return scope.includeUnowned ? { OR: [owned, { [field]: null }] } : owned;
    }
  }
}
