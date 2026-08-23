import { UserRole } from '../enums/UserRole';

interface InvitationProps {
  id: string;
  /** Null for a Platform Admin invitation, which belongs to no workspace. */
  tenantId: string | null;
  email: string;
  role: UserRole;
  token: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  warehouseId?: string | null;
  /** Who sent it. Null for invitations predating the column. */
  invitedByUserId?: string | null;
}

export class Invitation {
  public readonly id: string;
  public readonly tenantId: string | null;
  public readonly email: string;
  public readonly role: UserRole;
  public readonly token: string;
  public readonly expiresAt: Date;
  public readonly acceptedAt: Date | null;
  public readonly warehouseId: string | null;
  public readonly invitedByUserId: string | null;

  private constructor(props: InvitationProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.email = props.email;
    this.role = props.role;
    this.token = props.token;
    this.expiresAt = props.expiresAt;
    this.acceptedAt = props.acceptedAt;
    this.warehouseId = props.warehouseId || null;
    this.invitedByUserId = props.invitedByUserId || null;
  }

  public static create(props: InvitationProps): Invitation {
    return new Invitation(props);
  }

  public isExpired(): boolean {
    return this.expiresAt < new Date();
  }

  public isAccepted(): boolean {
    return this.acceptedAt !== null;
  }
}
