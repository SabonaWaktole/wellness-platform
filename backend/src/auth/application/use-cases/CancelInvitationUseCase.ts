import { AccessContext } from '../../../access/domain/AccessContext';
import { IInvitationRepository } from '../../domain/repositories/IInvitationRepository';

export class CancelInvitationUseCase {
  constructor(private invitationRepository: IInvitationRepository) {}

  async execute(input: { invitationId: string; access: AccessContext }) {
    input.access.ensure('users.manage');

    await this.invitationRepository.delete(input.invitationId);
  }
}
