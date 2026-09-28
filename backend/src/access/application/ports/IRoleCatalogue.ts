import { PermissionGrant } from '../../domain/DefaultRoleMatrix';

export interface RoleSummary {
  id: string;
  key: string;
  nameSq: string;
  nameEn: string;
  isSystem: boolean;
  grants: Readonly<Record<string, PermissionGrant>>;
}

/** Read side of a tenant's roles, for user administration (Slice 5) and the roles screen (Slice 6). */
export interface IRoleCatalogue {
  list(tenantId: string): Promise<RoleSummary[]>;
  findById(tenantId: string, roleId: string): Promise<RoleSummary | null>;
  /**
   * Active, not-deleted users of the tenant holding `permissionKey` — through
   * their role, or through the D2 mapping when they have no `roleId` yet.
   */
  activeHolderIds(tenantId: string, permissionKey: string): Promise<string[]>;
}
