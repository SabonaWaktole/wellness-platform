import { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';
import { RoleGrantMap } from '../../domain/DefaultRoleMatrix';

export interface NewRole {
  id: string;
  key: string;
  /** The system role this one descends from (see `lineageKeyOf`). */
  baseKey: string;
  nameSq: string;
  nameEn: string;
  grants: RoleGrantMap;
}

/** Writes to a tenant's roles (Slice 6). Every method takes `tenantId` first, so no write can cross tenants. */
export interface IRoleWrites {
  replaceGrants(tenantId: string, roleId: string, grants: RoleGrantMap): Promise<void>;
  create(tenantId: string, role: NewRole): Promise<void>;
  rename(tenantId: string, roleId: string, names: { nameSq: string; nameEn: string }): Promise<void>;
  delete(tenantId: string, roleId: string): Promise<void>;
}

export interface RoleAdminRepos {
  roles: IRoleWrites;
  auditTrail: IAuditTrail;
}

/**
 * One transaction for a role write and its audit entry (FR-RBAC-10,
 * FR-AUD-04): if the audit write fails, the permission change rolls back.
 */
export interface IRoleAdminTransaction {
  run<T>(work: (repos: RoleAdminRepos) => Promise<T>): Promise<T>;
}
