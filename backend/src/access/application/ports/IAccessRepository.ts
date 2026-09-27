import { PermissionGrant } from '../../domain/DefaultRoleMatrix';

/**
 * Everything `ResolveAccessContextUseCase` needs about one tenant user, in
 * one read. `grants` is empty when `roleId` is NULL — the use case then
 * falls back to `LegacyRoleMapping` (D2) rather than treating the user as
 * having no permissions at all.
 */
export interface AccessRecord {
  userId: string;
  tenantId: string;
  /** The legacy role string ('SUPER_ADMIN' | 'BUSINESS_OWNER' | 'STAFF'). */
  legacyRole: string;
  roleId: string | null;
  roleKey: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  grants: Readonly<Record<string, PermissionGrant>>;
}

/**
 * Read-only port for building an `AccessContext`. Deliberately narrow — it
 * has no write methods, because assigning a role is a `User` write done
 * through the existing user repository (Slice 5), not through here.
 */
export interface IAccessRepository {
  /** `null` when no such user exists in this tenant. */
  findAccessRecord(tenantId: string, userId: string): Promise<AccessRecord | null>;
}
