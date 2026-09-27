import { AccessContext } from '../../../access/domain/AccessContext';
import { IUserRepository } from '../../domain/repositories/IUserRepository';

export interface GetDeactivationImpactDTO {
  access: AccessContext;
  tenantId: string;
  userId: string;
}

/**
 * What would be left unattended if this user were deactivated.
 *
 * Read by the confirmation dialog so the decision is made with the consequence
 * visible, rather than discovered afterwards.
 */
export class GetDeactivationImpactUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute(dto: GetDeactivationImpactDTO): Promise<{ clients: number; upcomingAppointments: number }> {
    dto.access.ensure('users.manage');

    const target = await this.userRepository.findById(dto.userId);
    if (!target || target.tenantId !== dto.tenantId) {
      throw new Error('User not found.');
    }

    return this.userRepository.countAssignedWork(dto.userId);
  }
}
