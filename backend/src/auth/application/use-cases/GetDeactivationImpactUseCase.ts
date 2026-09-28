import { AccessContext } from '../../../access/domain/AccessContext';
import { AssignedWork, IUserRepository } from '../../domain/repositories/IUserRepository';

export interface GetDeactivationImpactDTO {
  access: AccessContext;
  tenantId: string;
  userId: string;
}

/**
 * What would be left unattended if this user were deactivated, and so what
 * has to be handed to a colleague first (FR-USR-05).
 *
 * Read by the confirmation dialog so the decision is made with the consequence
 * visible, rather than discovered afterwards.
 */
export class GetDeactivationImpactUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute(dto: GetDeactivationImpactDTO): Promise<AssignedWork> {
    dto.access.ensure('users.manage');

    const target = await this.userRepository.findById(dto.userId);
    if (!target || target.tenantId !== dto.tenantId) {
      throw new Error('User not found.');
    }

    return this.userRepository.countAssignedWork(dto.userId);
  }
}
