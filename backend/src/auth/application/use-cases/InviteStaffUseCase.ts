import { AccessContext } from '../../../access/domain/AccessContext';
import { IRoleCatalogue } from '../../../access/application/ports/IRoleCatalogue';
import { legacyRoleFor } from '../../../access/domain/LegacyRoleMapping';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { IEmailSender } from '../ports/IEmailSender';
import { IUserAdminTransaction } from '../ports/IUserAdminTransaction';
import { Invitation } from '../../domain/entities/Invitation';
import { UserRole } from '../../domain/enums/UserRole';
import { roleInTenant } from '../userAudit';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

export interface InviteStaffInput {
  access: AccessContext;
  invitingUserId: string;
  tenantId: string;
  tenantName?: string;
  /** The workspace's default language, which the invitation email is written in (FR-USR-02). */
  language?: string;
  inviteeEmail: string;
  /** One of the workspace's roles (FR-USR-02). */
  roleId: string;
  warehouseId?: string | null;
}

export class InviteStaffUseCase {
  constructor(
    private readonly roles: IRoleCatalogue,
    private readonly writeTx: IUserAdminTransaction,
    private readonly emailSender: IEmailSender
  ) {}

  async execute(input: InviteStaffInput) {
    input.access.ensure('users.manage');
    const role = await roleInTenant(this.roles, input.tenantId, input.roleId);

    const invitation = Invitation.create({
      id: uuidv4(),
      tenantId: input.tenantId,
      email: input.inviteeEmail,
      roleId: role.id,
      role: legacyRoleFor(role.key) as UserRole,
      token: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      acceptedAt: null,
      warehouseId: input.warehouseId || null,
      invitedByUserId: input.invitingUserId || null,
    });

    await this.writeTx.run(async ({ invitations, auditTrail }) => {
      await invitations.create(invitation);
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Create,
        entityType: 'Invitation',
        entityId: invitation.id,
        entityLabel: invitation.email,
        changes: [
          { field: 'email', old: null, new: invitation.email },
          { field: 'role', old: null, new: role.key },
        ],
      });
    });

    // Sent in the background so a slow mail server never holds up the response.
    this.emailSender.sendInvitationEmail(input.inviteeEmail, invitation.token, input.tenantName, input.language).catch((err) => {
      console.error('Failed to send invitation email in background:', err);
    });

    return { email: input.inviteeEmail, token: invitation.token };
  }
}
