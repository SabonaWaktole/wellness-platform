import { createHash } from 'crypto';
import { PermissionGrant } from './DefaultRoleMatrix';
import { PermissionScope, scopeAtLeast } from './PermissionScope';
import { PERMISSION_CATALOGUE } from './PermissionCatalogue';
import { PermissionDeniedError } from './errors';

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
   * Throws `PermissionDeniedError` unless `key` is held at any scope. The
   * one-line guard a use case opens with, in place of the role-name
   * comparisons FR-RBAC-05 retires.
   */
  ensure(key: string, message?: string): void {
    if (!this.can(key)) {
      throw new PermissionDeniedError(key, message);
    }
  }

  /**
   * Throws `PermissionDeniedError` unless `key` is held at `minScope` or
   * wider — for an action a narrower grant of the same key must not reach
   * (e.g. warehouse management under `inventory.manage: ALL`).
   */
  ensureScope(key: string, minScope: PermissionScope, message?: string): void {
    if (!scopeAtLeast(this.scopeOf(key), minScope)) {
      throw new PermissionDeniedError(key, message);
    }
  }

  /**
   * True when `key` is held at `OWN` exactly — the caller may only touch
   * records they created or are assigned. What the legacy `role === STAFF`
   * checks meant.
   */
  ownOnly(key: string): boolean {
    return this.scopeOf(key) === PermissionScope.Own;
  }

  /**
   * True when the caller may touch a record through `key`: they hold it, and
   * either their scope is wider than OWN or they are one of `ownerIds` (the
   * record's creator, assignee, …). The per-record form of what a repository
   * filter does for lists.
   */
  reaches(key: string, ownerIds: ReadonlyArray<string | null | undefined>): boolean {
    if (!this.can(key)) {
      return false;
    }
    return !this.ownOnly(key) || ownerIds.includes(this.userId);
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
