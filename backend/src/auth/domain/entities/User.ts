import { UserRole } from '../enums/UserRole';

interface UserProps {
  id: string;
  email: string;
  hashedPassword: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  role: UserRole;
  /** The tenant role (Slice 3). Null for SUPER_ADMIN and for users not yet mapped (D2). */
  roleId?: string | null;
  tenantId: string | null;
  warehouseId?: string | null;
  /** Defaults to true so existing construction sites keep working. */
  isActive?: boolean;
  /**
   * Platform Admin soft-delete. `null` means not deleted. Distinct from
   * `isActive`: a deleted user is always inactive, but an inactive user is
   * not necessarily deleted (ordinary suspension leaves this null).
   */
  deletedAt?: Date | null;
  /**
   * Interface language override. `null` means "follow the workspace default" —
   * deliberately distinct from having chosen English, so a tenant changing its
   * default moves users who never expressed a preference.
   */
  language?: string | null;
  createdAt: Date;
}

export class User {
  public readonly id: string;
  public readonly email: string;
  public readonly hashedPassword: string;
  public readonly firstName: string | null;
  public readonly lastName: string | null;
  public readonly phone: string | null;
  public readonly role: UserRole;
  public readonly roleId: string | null;
  public readonly tenantId: string | null;
  public warehouseId: string | null;
  /**
   * Deactivated users are retained, never deleted: seven non-nullable columns
   * reference User, so removal would be blocked by the database or would
   * destroy financial and audit history.
   */
  public readonly isActive: boolean;
  public readonly deletedAt: Date | null;
  public readonly language: string | null;
  public readonly createdAt: Date;

  private constructor(props: UserProps) {
    this.id = props.id;
    this.email = props.email;
    this.hashedPassword = props.hashedPassword;
    this.firstName = props.firstName || null;
    this.lastName = props.lastName || null;
    this.phone = props.phone || null;
    this.role = props.role;
    this.roleId = props.roleId ?? null;
    this.tenantId = props.tenantId;
    this.warehouseId = props.warehouseId || null;
    this.isActive = props.isActive ?? true;
    this.deletedAt = props.deletedAt ?? null;
    this.language = props.language ?? null;
    this.createdAt = props.createdAt;
  }

  public static create(props: UserProps): User {
    if (props.role === UserRole.SUPER_ADMIN && props.tenantId !== null) {
      throw new Error('SUPER_ADMIN must not be associated with a tenant');
    }
    if (props.role !== UserRole.SUPER_ADMIN && props.tenantId === null) {
      throw new Error(`${props.role} must be associated with a tenant`);
    }
    return new User(props);
  }
}
