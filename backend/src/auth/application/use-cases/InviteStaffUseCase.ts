import { AccessContext } from '../../../access/domain/AccessContext';
import { IInvitationRepository } from '../../domain/repositories/IInvitationRepository';
import { IEmailSender } from '../ports/IEmailSender';
import { Invitation } from '../../domain/entities/Invitation';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

export class InviteStaffUseCase {
  constructor(
    private invitationRepository: IInvitationRepository,
    private emailSender: IEmailSender
  ) {}

  async execute(input: any) {
    input.access.ensure('users.manage');

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const invitation = Invitation.create({
      id: uuidv4(),
      tenantId: input.tenantId,
      email: input.inviteeEmail,
      role: input.role,
      token,
      expiresAt,
      acceptedAt: null,
      warehouseId: input.warehouseId || null,
      // The controller has always passed invitingUserId; until the column
      // existed there was nowhere to put it, so the system had no record of
      // who invited whom. Without it, "your invitation was accepted" has
      // no-one to notify.
      invitedByUserId: input.invitingUserId || null,
    });

    await this.invitationRepository.create(invitation);
    
    // Send email in background without blocking the UI response
    this.emailSender.sendInvitationEmail(input.inviteeEmail, token, input.tenantName).catch((err) => {
      console.error('Failed to send invitation email in background:', err);
    });

    return { email: input.inviteeEmail, token };
  }
}
