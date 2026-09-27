import { Prisma } from '@prisma/client';
import { RecordScope } from '../domain/RecordScope';

/**
 * The Prisma `where` fragment for `scope` over the owner column `field`
 * (FR-RBAC-13: filter in the query, never after loading). Put it in an `AND`
 * array beside the caller's own conditions — it may carry its own `OR` — or
 * under a relation, e.g. `{ client: ownerWhere(scope, 'assignedUserId') }`.
 * Pass `nullable: false` for an owner column that can never be NULL (an
 * appointment always has an assignee): Prisma rejects `field: null` there.
 */
export function ownerWhere(
  scope: RecordScope,
  field: string,
  { nullable = true }: { nullable?: boolean } = {}
): Record<string, unknown> {
  switch (scope.kind) {
    case 'all':
      return {};
    case 'none':
      return { id: { in: [] } };
    case 'owners': {
      const owned = { [field]: { in: [...scope.userIds] } };
      return scope.includeUnowned && nullable ? { OR: [owned, { [field]: null }] } : owned;
    }
  }
}

/**
 * The raw-SQL counterpart of `ownerWhere`, for queries Prisma's builder can't
 * express (JSON containment). `column` is the already-quoted owner column for
 * the current dialect. Starts with `AND`, so it slots into an existing WHERE.
 */
export function ownerSql(scope: RecordScope, column: Prisma.Sql): Prisma.Sql {
  switch (scope.kind) {
    case 'all':
      return Prisma.empty;
    case 'none':
      return Prisma.sql`AND 1 = 0`;
    case 'owners': {
      const owned = scope.userIds.length > 0 ? Prisma.sql`${column} IN (${Prisma.join([...scope.userIds])})` : Prisma.sql`1 = 0`;
      return scope.includeUnowned ? Prisma.sql`AND (${owned} OR ${column} IS NULL)` : Prisma.sql`AND ${owned}`;
    }
  }
}
