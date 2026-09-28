import { AccessContext } from '../../../access/domain/AccessContext';
import { IInvitationRepository } from '../../domain/repositories/IInvitationRepository';

export class GetPendingInvitationsUseCase {
  constructor(private invitationRepository: IInvitationRepository) {}

  async execute(input: { tenantId: string; access: AccessContext }) {
    input.access.ensure('users.manage');

    const invitations = await this.invitationRepository.findByTenantId(input.tenantId);
    
    // Filter out accepted ones or expired ones
    const now = new Date();
    const pendingInvitations = invitations.filter(inv => !inv.acceptedAt && inv.expiresAt > now);

    return pendingInvitations.map(inv => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expiresAt,
    }));
  }
}
