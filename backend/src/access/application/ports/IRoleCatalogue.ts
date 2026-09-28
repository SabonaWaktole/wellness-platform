import { PermissionGrant } from '../../domain/DefaultRoleMatrix';

export interface RoleSummary {
  id: string;
  key: string;
  nameSq: string;
  nameEn: string;
  isSystem: boolean;
  /** For a custom role, the system role it was copied from, directly or through another copy; null for a system role. */
  baseKey: string | null;
  grants: Readonly<Record<string, PermissionGrant>>;
}

export interface RoleUsage {
  users: number;
  invitations: number;
}

/** Read side of a tenant's roles, for user administration (Slice 5) and the roles screen (Slice 6). */
export interface IRoleCatalogue {
  list(tenantId: string): Promise<RoleSummary[]>;
  findById(tenantId: string, roleId: string): Promise<RoleSummary | null>;
  /**
   * Active, not-deleted users of the tenant holding `permissionKey` — through
   * their role, or through the D2 mapping when they have no `roleId` yet.
   * `excludingRoleId` leaves out the holders of that one role, to ask "who
   * would still hold it if this role lost it?" (FR-RBAC-08).
   */
  activeHolderIds(tenantId: string, permissionKey: string, options?: { excludingRoleId?: string }): Promise<string[]>;
  /**
   * Who a role is assigned to: users not deleted (active or deactivated, since
   * a deactivated user keeps their role for reactivation) and invitations not
   * yet accepted.
   */
  usage(tenantId: string, roleId: string): Promise<RoleUsage>;
}
