import { CreateUserUseCase } from '@auth/application/use-cases/CreateUserUseCase';
import { IPasswordHasher } from '@auth/application/ports/IPasswordHasher';
import { UserRole } from '@auth/domain/enums/UserRole';
import { UnauthorizedError, UnknownRoleError } from '@auth/domain/errors';
import { PermissionDeniedError } from '../../../../../src/access/domain/errors';
import { AuditAction } from '../../../../../src/audit/domain/AuditAction';
import { administrator, platformOperator, salesUser } from '../../../../support/access';
import { makeRoleCatalogue, makeUserRepository } from '../../../../support/fakeUserAdmin';
import { makeUserAdminHarness } from '../../../../support/fakeUserAdminTransaction';

describe('CreateUserUseCase', () => {
  const setup = () => {
    const userRepository = makeUserRepository();
    const passwordHasher: jest.Mocked<IPasswordHasher> = { hash: jest.fn().mockResolvedValue('hashed'), compare: jest.fn() };
    const harness = makeUserAdminHarness();
    const useCase = new CreateUserUseCase(userRepository, passwordHasher, makeRoleCatalogue(), harness.writeTx);
    const create = (over: Record<string, unknown> = {}) =>
      useCase.execute({
        access: administrator({ userId: 'admin', tenantId: 'tenant1' }),
        callerTenantId: 'tenant1',
        tenantId: 'tenant1',
        email: 'new@example.com',
        password: 'Password1',
        roleId: 'role-SALES_USER',
        ...over,
      } as any);
    return { userRepository, passwordHasher, harness, create };
  };

  describe('who may create what', () => {
    it('FR-USR-02 lets an Administrator create an account with any of the workspace\'s roles', async () => {
      const { harness, create } = setup();

      const result = await create({ roleId: 'role-ADMINISTRATOR' });

      expect(result).toMatchObject({ roleId: 'role-ADMINISTRATOR', role: UserRole.BUSINESS_OWNER, tenantId: 'tenant1' });
      expect(harness.staff.create).toHaveBeenCalled();
    });

    it('lets the platform operator staff a workspace they do not belong to', async () => {
      const { create } = setup();

      await expect(create({ access: platformOperator(), callerTenantId: null })).resolves.toMatchObject({ tenantId: 'tenant1' });
    });

    it('stops an Administrator creating a user in another workspace', async () => {
      const { harness, create } = setup();
      await expect(create({ callerTenantId: 'tenant-b' })).rejects.toThrow(UnauthorizedError);
      expect(harness.staff.create).not.toHaveBeenCalled();
    });

    it('FR-RBAC-05 stops a role without users.manage creating anyone', async () => {
      const { create } = setup();
      await expect(create({ access: salesUser() })).rejects.toThrow(PermissionDeniedError);
    });

    it('refuses a role that is not one of the workspace\'s', async () => {
      const { harness, create } = setup();
      await expect(create({ roleId: 'role-elsewhere' })).rejects.toThrow(UnknownRoleError);
      expect(harness.staff.create).not.toHaveBeenCalled();
    });
  });

  it('FR-USR-06 audits the new account', async () => {
    const { harness, create } = setup();

    const result = await create();

    expect(harness.recordedAuditEntries()).toEqual([
      {
        tenantId: 'tenant1',
        userId: 'admin',
        userRole: 'ADMINISTRATOR',
        action: AuditAction.Create,
        entityType: 'User',
        entityId: result.id,
        entityLabel: 'new@example.com',
        changes: [
          { field: 'email', old: null, new: 'new@example.com' },
          { field: 'role', old: null, new: 'SALES_USER' },
        ],
      },
    ]);
  });

  describe('credentials', () => {
    it('stores a hash, never the plaintext, and never returns either', async () => {
      const { passwordHasher, harness, create } = setup();

      const result = await create();

      expect(passwordHasher.hash).toHaveBeenCalledWith('Password1');
      expect(harness.staff.create.mock.calls[0][0].hashedPassword).toBe('hashed');
      expect(JSON.stringify(result)).not.toContain('Password1');
      expect(JSON.stringify(result)).not.toContain('hashed');
    });

    it('creates the account already active, so the password works immediately', async () => {
      const { create } = setup();
      expect((await create()).isActive).toBe(true);
    });
  });

  it('rejects an email already used in the same workspace', async () => {
    const { userRepository, create } = setup();
    userRepository.findByEmail.mockResolvedValue({ id: 'existing' } as any);

    await expect(create()).rejects.toThrow(/already exists/i);
    expect(userRepository.findByEmail).toHaveBeenCalledWith('new@example.com', 'tenant1');
  });
});
