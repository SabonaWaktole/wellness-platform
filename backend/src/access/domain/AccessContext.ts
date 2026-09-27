import { createHash } from 'crypto';
import { PermissionGrant } from './DefaultRoleMatrix';
import { PermissionScope } from './PermissionScope';
import { PERMISSION_CATALOGUE } from './PermissionCatalogue';

export interface AccessContextProps {
  userId: string;
  tenantId: string;
  /** The role key this context was resolved from, or `null` for the platform operator. */
  roleKey: string | null;
  permissions: Readonly<Record<string, PermissionGrant>>;
  /** SUPER_ADMIN, or a request made while impersonating a tenant — sees everything. */
  isPlatformOperator: boolean;
}

/**
 * What one authenticated request may do (FR-RBAC-01..09). Built once per
 * request by `ResolveAccessContextUseCase` and attached to `req.access` —
 * `requirePermission` and every migrated use case read it instead of
 * comparing `role` strings.
 */
export class AccessContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly roleKey: string | null;
  readonly isPlatformOperator: boolean;
  private readonly permissions: Readonly<Record<string, PermissionGrant>>;

  constructor(props: AccessContextProps) {
    this.userId = props.userId;
    this.tenantId = props.tenantId;
    this.roleKey = props.roleKey;
    this.isPlatformOperator = props.isPlatformOperator;
    this.permissions = props.permissions;
  }

  /** True when this context holds `key` at all, at any scope. */
  can(key: string): boolean {
    return this.permissions[key] !== undefined;
  }

  /**
   * The scope this context holds `key` at, or `null` when the permission is
   * not held or is a plain (unscoped) capability. Callers doing a
   * capability check use `can()`; callers filtering data use this.
   */
  scopeOf(key: string): PermissionScope | null {
    const grant = this.permissions[key];
    return grant === true || grant === undefined ? null : grant;
  }

  /**
   * A stable fingerprint of this context's grants, sent as
   * `X-Permissions-Version` (FR-USR-03). It changes exactly when the grants
   * change — a role's permissions are edited, or the user's role changes —
   * with no counter to keep in sync, because it's a hash of the grants
   * themselves rather than an incrementing value.
   */
  get version(): string {
    const sorted = Object.keys(this.permissions)
      .sort()
      .map((key) => `${key}:${String(this.permissions[key])}`)
      .join(',');
    return createHash('sha1').update(`${this.roleKey ?? 'PLATFORM_OPERATOR'}|${sorted}`).digest('hex').slice(0, 16);
  }

  /** `{ [key]: scope | true }`, as returned by `GET /auth/me`. */
  toJSON(): Record<string, PermissionGrant> {
    return { ...this.permissions };
  }

  /** SUPER_ADMIN, or an admin impersonating a tenant: every catalogue key at its widest grant. */
  static platformOperator(userId: string, tenantId: string): AccessContext {
    const permissions: Record<string, PermissionGrant> = {};
    for (const entry of PERMISSION_CATALOGUE) {
      permissions[entry.key] = entry.supportsScope ? PermissionScope.All : true;
    }
    return new AccessContext({ userId, tenantId, roleKey: null, permissions, isPlatformOperator: true });
  }
}
