import { CreatePlatformAdminUseCase } from './CreatePlatformAdminUseCase';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IPasswordHasher } from '../ports/IPasswordHasher';
import { IAuditLogger } from '../../../shared/application/ports/IAuditLogger';
import { UserRole } from '../../domain/enums/UserRole';
import { User } from '../../domain/entities/User';
import { UnauthorizedError, EmailAlreadyInUseError } from '../../domain/errors';

describe('CreatePlatformAdminUseCase', () => {
  let useCase: CreatePlatformAdminUseCase;
  let userRepository: jest.Mocked<IUserRepository>;
  let passwordHasher: jest.Mocked<IPasswordHasher>;
  let auditLogger: jest.Mocked<IAuditLogger>;

  const CALLER = 'super-admin-1';

  const create = (over: any = {}) =>
    useCase.execute({
      callerRole: UserRole.SUPER_ADMIN,
      callerId: CALLER,
      email: 'new-admin@example.com',
      password: 'Sup3rSecret',
      ...over,
    });

  beforeEach(() => {
    userRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findAnyByEmail: jest.fn().mockResolvedValue(null),
      findSuperAdminByEmail: jest.fn(),
      create: jest.fn(),
      updatePassword: jest.fn(),
      updateProfile: jest.fn(),
      findByTenantId: jest.fn(),
      updateRoleAndWarehouse: jest.fn(),
      setActive: jest.fn(),
      softDelete: jest.fn(),
      countAssignedWork: jest.fn(),
      findActiveByTenantAndRole: jest.fn().mockResolvedValue([]),
      findPlatformUsers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      countActivePlatformAdmins: jest.fn().mockResolvedValue(1),
    };
    passwordHasher = { hash: jest.fn().mockResolvedValue('hashed'), compare: jest.fn() };
    auditLogger = { record: jest.fn(), findRecent: jest.fn() };
    useCase = new CreatePlatformAdminUseCase(userRepository, passwordHasher, auditLogger);
  });

  it('refuses a non-SUPER_ADMIN caller and creates nothing', async () => {
    // The whole point of the role: it can only ever be handed on by someone who
    // already holds it, never escalated into from a workspace role.
    await expect(create({ callerRole: UserRole.BUSINESS_OWNER })).rejects.toThrow(UnauthorizedError);
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('creates an admin with no tenant', async () => {
    const result = await create();

    expect(result.role).toBe(UserRole.SUPER_ADMIN);
    const created = userRepository.create.mock.calls[0][0] as User;
    // A SUPER_ADMIN with a tenantId would be rejected by User.create outright;
    // asserting it here pins the intent rather than relying on that throw.
    expect(created.tenantId).toBeNull();
    expect(created.role).toBe(UserRole.SUPER_ADMIN);
    expect(created.hashedPassword).toBe('hashed');
  });

  it('never stores the password in the clear, and never returns it', async () => {
    const result = await create({ password: 'Sup3rSecret' });

    expect(passwordHasher.hash).toHaveBeenCalledWith('Sup3rSecret');
    const created = userRepository.create.mock.calls[0][0] as User;
    expect(created.hashedPassword).not.toBe('Sup3rSecret');
    expect(JSON.stringify(result)).not.toContain('Sup3rSecret');
  });

  it('rejects an email already used by ANY account, not just another admin', async () => {
    // A platform admin signs in with no slug, which resolves through
    // findAnyByEmail — a collision with an ordinary workspace account would make
    // that lookup return an arbitrary one of the two.
    userRepository.findAnyByEmail.mockResolvedValue(
      User.create({
        id: 'staff-1',
        email: 'new-admin@example.com',
        hashedPassword: 'h',
        role: UserRole.STAFF,
        tenantId: 'tenant-1',
        createdAt: new Date(),
      })
    );

    await expect(create()).rejects.toThrow(EmailAlreadyInUseError);
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('allows reusing the address of a soft-deleted account', async () => {
    // A deleted account has had its email anonymized, so the address is free —
    // refusing here would retire an address permanently on first mistake.
    userRepository.findAnyByEmail.mockResolvedValue(
      User.create({
        id: 'old-admin',
        email: 'new-admin@example.com',
        hashedPassword: 'h',
        role: UserRole.SUPER_ADMIN,
        tenantId: null,
        deletedAt: new Date(),
        createdAt: new Date(),
      })
    );

    await expect(create()).resolves.toBeDefined();
    expect(userRepository.create).toHaveBeenCalled();
  });

  it('normalises the email so case cannot create a near-duplicate admin', async () => {
    await create({ email: '  New-Admin@Example.COM  ' });

    expect(userRepository.findAnyByEmail).toHaveBeenCalledWith('new-admin@example.com');
    const created = userRepository.create.mock.calls[0][0] as User;
    expect(created.email).toBe('new-admin@example.com');
  });

  it('records an audit entry with no tenant', async () => {
    await create();

    expect(auditLogger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PLATFORM_ADMIN_CREATED',
        actorUserId: CALLER,
        tenantId: null,
      })
    );
  });
});
