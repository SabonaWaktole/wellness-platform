import { RoleKey } from '../../domain/RoleKey';

/** Gives a new tenant its five system roles with the §4.2 defaults (FR-RBAC-01). */
export interface ISystemRoleSeeder {
  /** Each seeded role's id, by key. */
  seed(tenantId: string): Promise<Record<RoleKey, string>>;
}
