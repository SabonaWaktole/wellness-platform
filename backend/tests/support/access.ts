import { RecordScopeResolver } from '../../src/access/application/RecordScopeResolver';
import { AccessContext } from '../../src/access/domain/AccessContext';
import { DEFAULT_ROLE_MATRIX, PermissionGrant } from '../../src/access/domain/DefaultRoleMatrix';
import { RoleKey } from '../../src/access/domain/RoleKey';

interface AccessOptions {
  userId?: string;
  tenantId?: string;
  /** Extra grants on top of the role's default matrix, e.g. a customised role (Slice 6). */
  grant?: Record<string, PermissionGrant>;
  /** Keys removed from the role's default matrix. */
  revoke?: string[];
}

/**
 * An `AccessContext` for a use-case unit test: the §4.2 default grants of
 * `roleKey`, optionally edited. Use cases take this instead of a role string
 * (FR-RBAC-05), so tests describe callers by what they may do.
 */
export function accessAs(roleKey: RoleKey, options: AccessOptions = {}): AccessContext {
  const permissions: Record<string, PermissionGrant> = { ...DEFAULT_ROLE_MATRIX[roleKey], ...options.grant };
  for (const key of options.revoke ?? []) {
    delete permissions[key];
  }
  return new AccessContext({
    userId: options.userId ?? 'u1',
    tenantId: options.tenantId ?? 't1',
    roleKey,
    permissions,
    isPlatformOperator: false,
  });
}

/** A caller holding exactly `permissions` and nothing else — a hand-built custom role. */
export function accessWith(
  permissions: Record<string, PermissionGrant>,
  options: { userId?: string; tenantId?: string } = {}
): AccessContext {
  return new AccessContext({
    userId: options.userId ?? 'u1',
    tenantId: options.tenantId ?? 't1',
    roleKey: 'CUSTOM',
    permissions,
    isPlatformOperator: false,
  });
}

export const administrator = (options?: AccessOptions) => accessAs(RoleKey.Administrator, options);
export const salesUser = (options?: AccessOptions) => accessAs(RoleKey.SalesUser, options);
export const salesManager = (options?: AccessOptions) => accessAs(RoleKey.SalesManager, options);
export const reception = (options?: AccessOptions) => accessAs(RoleKey.Reception, options);
export const ceo = (options?: AccessOptions) => accessAs(RoleKey.Ceo, options);
export const platformOperator = (userId = 'sa1', tenantId = 't1') => AccessContext.platformOperator(userId, tenantId);

/** A `RecordScopeResolver` over a fixed Sales User roster, for use-case tests. */
export const scopeResolver = (salesUserIds: string[] = []) =>
  new RecordScopeResolver({ salesUserIds: async () => salesUserIds });
