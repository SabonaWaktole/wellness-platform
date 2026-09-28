import { ListRolesUseCase } from '../../../../src/access/application/use-cases/ListRolesUseCase';
import { PermissionDeniedError } from '../../../../src/access/domain/errors';
import { administrator, salesUser } from '../../../support/access';
import { makeRoleCatalogue } from '../../../support/fakeUserAdmin';

describe('ListRolesUseCase', () => {
  it('FR-USR-02 lists the workspace\'s roles with both labels, for the role picker', async () => {
    const roles = makeRoleCatalogue();

    const result = await new ListRolesUseCase(roles).execute({ access: administrator(), tenantId: 'tenant1' });

    expect(roles.list).toHaveBeenCalledWith('tenant1');
    expect(result).toContainEqual({ id: 'role-RECEPTION', key: 'RECEPTION', nameSq: 'Recepsion', nameEn: 'Reception', isSystem: true });
    expect(result).toHaveLength(5);
  });

  it('FR-RBAC-05 refuses a caller without users.manage', async () => {
    await expect(
      new ListRolesUseCase(makeRoleCatalogue()).execute({ access: salesUser(), tenantId: 'tenant1' })
    ).rejects.toThrow(PermissionDeniedError);
  });
});
