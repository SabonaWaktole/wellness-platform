import { IInvitationRepository } from '../../domain/repositories/IInvitationRepository';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
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
    private userRepository: IUserRepository,
    private passwordHasher: IPasswordHasher,
    private tenantRepository: ITenantRepository,
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
      tenantId: invitation.tenantId,
      warehouseId: invitation.warehouseId,
      createdAt: new Date(),
    });

    await this.userRepository.create(user);
    await this.invitationRepository.markAccepted(invitation.id, new Date());

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
