import { IInvitationRepository } from '../../domain/repositories/IInvitationRepository';
import { IUserAdminTransaction } from '../ports/IUserAdminTransaction';
import { IRoleCatalogue } from '../../../access/application/ports/IRoleCatalogue';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { currentRoleKey } from '../userAudit';
import { IPasswordHasher } from '../ports/IPasswordHasher';
import { InvitationExpiredError, InvitationAlreadyAcceptedError } from '../../domain/errors';
import { User } from '../../domain/entities/User';
import { Password } from '../../domain/value-objects/Password';
import { v4 as uuidv4 } from 'uuid';

import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { NotificationService } from '../../../notifications/application/NotificationService';

export class AcceptInvitationUseCase {
  constructor(
    private invitationRepository: IInvitationRepository,
    private passwordHasher: IPasswordHasher,
    private tenantRepository: ITenantRepository,
    private roles: IRoleCatalogue,
    private writeTx: IUserAdminTransaction,
    private notifications?: NotificationService
  ) {}

  async execute(input: any) {
    const invitation = await this.invitationRepository.findByToken(input.token);
    if (!invitation) throw new Error('Invitation not found'); // Or custom error

    if (invitation.isExpired()) throw new InvitationExpiredError();
    if (invitation.isAccepted()) throw new InvitationAlreadyAcceptedError();

    const password = new Password(input.newPassword);
    const hashedPassword = await this.passwordHasher.hash(password.value);

    const user = User.create({
      id: uuidv4(),
      email: invitation.email,
      hashedPassword,
      role: invitation.role,
      roleId: invitation.roleId,
      tenantId: invitation.tenantId,
      warehouseId: invitation.warehouseId,
      createdAt: new Date(),
    });

    const roleKey = await currentRoleKey(user, this.roles);
    await this.writeTx.run(async ({ staff, invitations, auditTrail }) => {
      await staff.create(user);
      await invitations.markAccepted(invitation.id, new Date());
      // A Platform Admin invitation has no workspace, and so no audit trail to join.
      if (invitation.tenantId) {
        await auditTrail.record({
          tenantId: invitation.tenantId,
          userId: user.id,
          userRole: roleKey ?? user.role,
          action: AuditAction.Create,
          entityType: 'User',
          entityId: user.id,
          entityLabel: user.email,
          changes: [
            { field: 'email', old: null, new: user.email },
            { field: 'role', old: null, new: roleKey },
          ],
        });
      }
    });

    // Null for a Platform Admin invitation, which belongs to no workspace.
    const tenant = invitation.tenantId ? await this.tenantRepository.findById(invitation.tenantId) : null;

    /*
     * Tells the person who sent the invitation that it landed.
     *
     * `invitedByUserId` is nullable — invitations created before the column
     * existed cannot be attributed — so this is conditional rather than
     * assumed. It is NOT redirected to all Business Owners in that case:
     * guessing a recipient would make an unattributable event look attributed.
     *
     * The actor is the new user, who has just been created and is active, and
     * is never the recipient, so no self-notification is possible here.
     * Skipped entirely for a Platform Admin invitation: notifications are
     * tenant-scoped and there is no workspace to emit one into.
     */
    if (invitation.invitedByUserId && invitation.tenantId) {
      await this.notifications?.emitSafe({
        tenantId: invitation.tenantId,
        recipientUserIds: [invitation.invitedByUserId],
        type: 'INVITATION_ACCEPTED',
        params: { email: user.email },
        actorUserId: user.id,
      });
    }

    return { user, tenantSlug: tenant?.urlSlug };
  }
}
