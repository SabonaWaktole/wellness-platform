import { User } from '../entities/User';

export interface PlatformUserFilters {
  tenantId?: string;
  role?: string;
  isActive?: boolean;
  /** Case-insensitive fragment matched against email, first name and last name. */
  q?: string;
  skip?: number;
  take?: number;
}

/**
 * A user as the platform console lists them, carrying the workspace NAME rather
 * than only its id. Deliberately not a `User` entity: the entity has no place
 * for a joined column, and the console's whole job is showing which workspace
 * each person belongs to.
 */
export interface PlatformUserRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
  tenantId: string | null;
  tenantName: string | null;
  createdAt: Date;
  /**
   * Present (non-null) only when the row is the ORIGINAL owner of an
   * unresolved suspension-time ownership transfer — the console needs this to
   * know whether reactivating them requires the restore/keep choice.
   */
  pendingOwnershipTransfer: { actingOwnerName: string } | null;
}

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string, tenantId: string): Promise<User | null>;
  findAnyByEmail(email: string): Promise<User | null>;
  findSuperAdminByEmail(email: string): Promise<User | null>;
  /**
   * How many platform administrators can still sign in — active and not
   * soft-deleted.
   *
   * Exists for one question: "if this admin closes their account, is anyone
   * left?" Counting rather than listing because that is the whole of what the
   * caller needs, and the alternative (`findPlatformUsers` filtered by role)
   * is paginated and capped, so it answers a different question than it
   * appears to. See DeletePlatformAdminSelfUseCase.
   */
  countActivePlatformAdmins(): Promise<number>;
  create(user: User): Promise<User>;
  updatePassword(userId: string, hashedPassword: string): Promise<void>;
  findByTenantId(tenantId: string): Promise<User[]>;
  /**
   * Active users in a tenant holding a given role.
   *
   * Deliberately separate from `findByTenantId`, which returns EVERY user
   * including deactivated ones (Team Settings needs them in order to
   * reactivate). Notification recipients must never include someone who is
   * off-boarded: their token stays valid for up to an hour after deactivation
   * (TD-010), so filtering on the token alone is not enough — the filter has
   * to be on the record.
   */
  findActiveByTenantAndRole(tenantId: string, role: string): Promise<User[]>;
  updateProfile(userId: string, data: { firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string; language?: string | null }): Promise<void>;
  updateRoleAndWarehouse(userId: string, role: string, warehouseId: string | null): Promise<void>;
  /**
   * Soft off-boarding. There is deliberately no `delete`: seven non-nullable
   * columns reference User, so Postgres RESTRICT blocks removal outright and
   * cascading would erase quotations, interactions and audit history.
   */
  setActive(userId: string, isActive: boolean): Promise<void>;
  /**
   * Platform Admin soft-delete: sets `isActive=false`, `deletedAt=now()`, and
   * anonymizes email/name/phone/avatar so the account can never be
   * impersonated or re-surfaced, while the row itself survives for the same
   * FK-RESTRICT reason `setActive` does. There is deliberately no way back —
   * unlike `setActive`, this has no `undo` counterpart.
   */
  softDelete(userId: string): Promise<void>;
  /**
   * Work still pointing at a user, shown in the deactivation confirmation so
   * the owner sees what will be left unattended.
   */
  countAssignedWork(userId: string): Promise<{ clients: number; upcomingAppointments: number }>;
  /**
   * Every user on the platform, across all workspaces — the one query in this
   * repository that is deliberately NOT tenant-scoped. Only the SUPER_ADMIN
   * console calls it, and the route it sits behind is guarded accordingly.
   */
  findPlatformUsers(filters: PlatformUserFilters): Promise<{ items: PlatformUserRow[]; total: number }>;
}
