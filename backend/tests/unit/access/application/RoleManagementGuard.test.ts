import { RoleManagementGuard } from '../../../../src/access/application/RoleManagementGuard';
import { LastRoleManagerError } from '../../../../src/access/domain/errors';

const guardOver = (holderIds: string[]) =>
  new RoleManagementGuard({ activeHolderIds: jest.fn().mockResolvedValue(holderIds) });

describe('RoleManagementGuard (FR-RBAC-08)', () => {
  it('FR-RBAC-08 refuses to take roles.manage from its last active holder', async () => {
    await expect(guardOver(['admin']).ensureNotLastManager('t1', 'admin')).rejects.toBeInstanceOf(LastRoleManagerError);
  });

  it('allows it while another active user still holds roles.manage', async () => {
    await expect(guardOver(['admin', 'second']).ensureNotLastManager('t1', 'admin')).resolves.toBeUndefined();
  });

  it('allows any change to someone who does not hold roles.manage', async () => {
    await expect(guardOver(['admin']).ensureNotLastManager('t1', 'sales')).resolves.toBeUndefined();
  });

  it('asks about roles.manage in the caller\'s tenant', async () => {
    const roles = { activeHolderIds: jest.fn().mockResolvedValue(['a', 'b']) };
    await new RoleManagementGuard(roles).ensureNotLastManager('t1', 'a');
    expect(roles.activeHolderIds).toHaveBeenCalledWith('t1', 'roles.manage');
  });
});
