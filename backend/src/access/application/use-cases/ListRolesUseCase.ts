import { AccessContext } from '../../domain/AccessContext';
import { IRoleCatalogue } from '../ports/IRoleCatalogue';

/** The workspace's roles, as the Team page's role picker offers them (FR-USR-02). */
export class ListRolesUseCase {
  constructor(private readonly roles: IRoleCatalogue) {}

  async execute(input: { access: AccessContext; tenantId: string }) {
    input.access.ensure('users.manage');
    const roles = await this.roles.list(input.tenantId);
    return roles.map(({ id, key, nameSq, nameEn, isSystem }) => ({ id, key, nameSq, nameEn, isSystem }));
  }
}
