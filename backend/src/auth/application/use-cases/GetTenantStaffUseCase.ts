import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IRoleCatalogue } from '../../../access/application/ports/IRoleCatalogue';
import { legacyRoleKeyFor } from '../../../access/domain/LegacyRoleMapping';

export class GetTenantStaffUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly roles: IRoleCatalogue
  ) {}

  async execute(params: { tenantId: string }) {
    if (!params.tenantId) {
      throw new Error('Tenant ID is required');
    }

    const [users, roles] = await Promise.all([
      this.userRepository.findByTenantId(params.tenantId),
      this.roles.list(params.tenantId),
    ]);

    return {
      items: users.map((u) => {
        // A user without a roleId yet holds D2's mapped role.
        const role = u.roleId
          ? roles.find((r) => r.id === u.roleId)
          : roles.find((r) => r.key === legacyRoleKeyFor(u.role));
        return {
          id: u.id,
          email: u.email,
          // Names are needed to render a person anywhere a userId is stored —
          // the assignee selector and the Team Settings list.
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role,
          roleId: role?.id ?? null,
          roleKey: role?.key ?? null,
          roleNameSq: role?.nameSq ?? null,
          roleNameEn: role?.nameEn ?? null,
          warehouseId: u.warehouseId,
          isActive: u.isActive,
        };
      }),
    };
  }
}
