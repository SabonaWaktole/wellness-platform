import { AccessContext } from '../../domain/AccessContext';
import { DEFAULT_ROLE_MATRIX, PermissionGrant } from '../../domain/DefaultRoleMatrix';
import { legacyRoleKeyFor } from '../../domain/LegacyRoleMapping';
import { UserNotAccessibleError } from '../../domain/errors';
import { IAccessRepository } from '../ports/IAccessRepository';
import { InMemoryAccessCache } from '../../infrastructure/InMemoryAccessCache';

export interface ResolveAccessContextInput {
  userId: string;
  tenantId: string | null;
  /** The legacy role string from the JWT ('SUPER_ADMIN' | 'BUSINESS_OWNER' | 'STAFF'). */
  legacyRole: string;
  /** Present while a SUPER_ADMIN is managing a workspace they entered — see EnterTenantUseCase. */
  impersonatorId?: string | null;
}

/**
 * Resolves what one authenticated request may do (FR-RBAC-01, enabler for
 * FR-USR-03). Called by `loadAccess` on every tenant-scoped request.
 *
 * Four outcomes, in order:
 *   1. SUPER_ADMIN, or a request made while impersonating a tenant — always
 *      `AccessContext.platformOperator()`, never cached, never touches
 *      `IAccessRepository` (D2: SUPER_ADMIN has no row in the role table).
 *   2. A cache hit for this userId — returned as-is (D1's "small in-process
 *      cache").
 *   3. The user is missing, deactivated or soft-deleted — `UserNotAccessibleError`,
 *      which `loadAccess` turns into 401 (FR-USR-04 enforced per request).
 *   4. A `roleId` — its `RolePermission` grants. No `roleId` (every user left
 *      over from before this migration) — `LegacyRoleMapping`'s default
 *      grants for D2's mapped role, so the rollback path (dropping the
 *      column) stays safe.
 */
export class ResolveAccessContextUseCase {
  constructor(
    private readonly accessRepository: IAccessRepository,
    private readonly cache: InMemoryAccessCache
  ) {}

  async execute(input: ResolveAccessContextInput): Promise<AccessContext> {
    if (input.legacyRole === 'SUPER_ADMIN' || input.impersonatorId) {
      return AccessContext.platformOperator(input.userId, input.tenantId ?? '');
    }

    if (!input.tenantId) {
      throw new UserNotAccessibleError();
    }

    const cached = this.cache.get(input.userId);
    if (cached) {
      return cached;
    }

    const record = await this.accessRepository.findAccessRecord(input.tenantId, input.userId);
    if (!record || !record.isActive || record.deletedAt) {
      throw new UserNotAccessibleError();
    }

    const { roleKey, permissions } = this.grantsFor(record);
    const context = new AccessContext({
      userId: record.userId,
      tenantId: record.tenantId,
      roleKey,
      permissions,
      isPlatformOperator: false,
    });

    this.cache.set(input.userId, context);
    return context;
  }

  private grantsFor(record: {
    roleId: string | null;
    roleKey: string | null;
    legacyRole: string;
    grants: Readonly<Record<string, PermissionGrant>>;
  }): { roleKey: string | null; permissions: Readonly<Record<string, PermissionGrant>> } {
    if (record.roleId && record.roleKey) {
      return { roleKey: record.roleKey, permissions: record.grants };
    }

    const legacyKey = legacyRoleKeyFor(record.legacyRole);
    return { roleKey: legacyKey, permissions: legacyKey ? DEFAULT_ROLE_MATRIX[legacyKey] : {} };
  }
}
