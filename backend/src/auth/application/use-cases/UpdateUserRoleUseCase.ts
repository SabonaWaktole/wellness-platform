import { AccessContext } from '../../../access/domain/AccessContext';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { UserRole } from '../../domain/enums/UserRole';
import { UnauthorizedError } from '../../domain/errors';
import { IPermissionsChanged } from '../../../access/application/ports/IPermissionsChanged';

export class UpdateUserRoleUseCase {
  constructor(
    private userRepository: IUserRepository,
    /** D1: cleared so the user's very next request sees the new role's permissions (FR-USR-03). */
    private permissionsChanged?: IPermissionsChanged
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    userIdToUpdate: string;
    newRole: UserRole;
    newWarehouseId: string | null;
  }) {
    input.access.ensure('users.manage');

    const userToUpdate = await this.userRepository.findById(input.userIdToUpdate);
    if (!userToUpdate) {
      throw new Error('User not found');
    }

    if (userToUpdate.tenantId !== input.tenantId) {
      throw new UnauthorizedError('User does not belong to this tenant');
    }

    await this.userRepository.updateRoleAndWarehouse(
      input.userIdToUpdate,
      input.newRole,
      input.newWarehouseId
    );
    this.permissionsChanged?.userChanged(input.userIdToUpdate);

    return { success: true };
  }
}
