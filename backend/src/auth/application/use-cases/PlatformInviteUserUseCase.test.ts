import { PlatformInviteUserUseCase } from './PlatformInviteUserUseCase';
import { IInvitationRepository } from '../../domain/repositories/IInvitationRepository';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { IEmailSender } from '../ports/IEmailSender';
import { IAuditLogger } from '../../../shared/application/ports/IAuditLogger';
import { Invitation } from '../../domain/entities/Invitation';
import { User } from '../../domain/entities/User';
import { Tenant } from '../../../tenant/domain/entities/Tenant';
import { UserRole } from '../../domain/enums/UserRole';
import {
  UnauthorizedError,
  UserAlreadyInWorkspaceError,
  InvitationAlreadyPendingError,
  EmailAlreadyInUseError,
} from '../../domain/errors';
import { TenantNotFoundError } from '../../../tenant/domain/errors';

describe('PlatformInviteUserUseCase', () => {
  let useCase: PlatformInviteUserUseCase;
  let invitationRepository: jest.Mocked<IInvitationRepository>;
  let userRepository: jest.Mocked<Pick<IUserRepository, 'findByEmail' | 'findAnyByEmail'>>;
  let tenantRepository: jest.Mocked<Pick<ITenantRepository, 'findById'>>;
  let emailSender: jest.Mocked<IEmailSender>;
  let auditLogger: jest.Mocked<IAuditLogger>;

  const TENANT = 'tenant-1';
  const CALLER = 'super-admin-1';

  const invite = (over: any = {}) =>
    useCase.execute({
      callerRole: UserRole.SUPER_ADMIN,
      callerId: CALLER,
      tenantId: TENANT,
      email: 'new.owner@example.com',
      ...over,
    });

  const pendingInvitation = (email: string, over: Partial<{ expiresAt: Date; acceptedAt: Date | null }> = {}) =>
    Invitation.create({
      id: 'inv-1',
      tenantId: TENANT,
      email,
      role: UserRole.BUSINESS_OWNER,
      token: 'tok',
      expiresAt: over.expiresAt ?? new Date(Date.now() + 60_000),
      acceptedAt: over.acceptedAt ?? null,
    });

  beforeEach(() => {
    invitationRepository = {
      create: jest.fn(async (i) => i),
      findByToken: jest.fn(),
      findByTenantId: jest.fn().mockResolvedValue([]),
      markAccepted: jest.fn(),
      delete: jest.fn(),
    };
    userRepository = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findAnyByEmail: jest.fn().mockResolvedValue(null),
    };
    tenantRepository = {
      findById: jest.fn().mockResolvedValue(
        Tenant.create({ id: TENANT, name: 'Acme', urlSlug: 'acme', createdAt: new Date() })
      ),
    };
    emailSender = {
      sendPasswordResetEmail: jest.fn(),
      sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
      sendTransactionalEmail: jest.fn(),
      sendWorkspaceCreatedEmail: jest.fn(),
    } as any;
    auditLogger = { record: jest.fn(), findRecent: jest.fn() };

    useCase = new PlatformInviteUserUseCase(
      invitationRepository,
      userRepository as unknown as IUserRepository,
      tenantRepository as unknown as ITenantRepository,
      emailSender,
      auditLogger
    );
  });

  it('throws UnauthorizedError for a non-SUPER_ADMIN caller and creates nothing', async () => {
    await expect(invite({ callerRole: UserRole.BUSINESS_OWNER })).rejects.toThrow(UnauthorizedError);
    expect(invitationRepository.create).not.toHaveBeenCalled();
  });

  it('throws TenantNotFoundError for an unknown workspace', async () => {
    tenantRepository.findById.mockResolvedValue(null);
    await expect(invite()).rejects.toThrow(TenantNotFoundError);
    expect(invitationRepository.create).not.toHaveBeenCalled();
  });

  it('invites as BUSINESS_OWNER by default, attributed to the admin who sent it', async () => {
    const result = await invite();

    expect(result.role).toBe(UserRole.BUSINESS_OWNER);
    const created = invitationRepository.create.mock.calls[0][0];
    expect(created.role).toBe(UserRole.BUSINESS_OWNER);
    expect(created.tenantId).toBe(TENANT);
    expect(created.invitedByUserId).toBe(CALLER);
    expect(created.token).toHaveLength(64);
    expect(created.isExpired()).toBe(false);
  });

  it('normalises the email and sends the invitation with the workspace name', async () => {
    await invite({ email: '  New.Owner@Example.com ' });

    const created = invitationRepository.create.mock.calls[0][0];
    expect(created.email).toBe('new.owner@example.com');
    expect(emailSender.sendInvitationEmail).toHaveBeenCalledWith(
      'new.owner@example.com',
      created.token,
      'Acme'
    );
  });

  it('honours an explicit STAFF role', async () => {
    const result = await invite({ role: UserRole.STAFF });
    expect(result.role).toBe(UserRole.STAFF);
    expect(invitationRepository.create.mock.calls[0][0].role).toBe(UserRole.STAFF);
  });

  it('records the invitation in the audit trail', async () => {
    await invite();

    expect(auditLogger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: CALLER,
        action: 'USER_INVITED',
        targetType: 'INVITATION',
        tenantId: TENANT,
        metadata: expect.objectContaining({ email: 'new.owner@example.com', role: UserRole.BUSINESS_OWNER }),
      })
    );
  });

  it('refuses when the invitee already has an account in that workspace', async () => {
    userRepository.findByEmail.mockResolvedValue(
      User.create({
        id: 'existing-1',
        email: 'new.owner@example.com',
        hashedPassword: 'h',
        role: UserRole.STAFF,
        tenantId: TENANT,
        createdAt: new Date(),
      })
    );

    await expect(invite()).rejects.toThrow(UserAlreadyInWorkspaceError);
    expect(invitationRepository.create).not.toHaveBeenCalled();
  });

  it('refuses a second invitation while one is still pending', async () => {
    invitationRepository.findByTenantId.mockResolvedValue([pendingInvitation('new.owner@example.com')]);

    await expect(invite()).rejects.toThrow(InvitationAlreadyPendingError);
    expect(invitationRepository.create).not.toHaveBeenCalled();
  });

  it('allows a fresh invitation once the previous one expired or was accepted', async () => {
    invitationRepository.findByTenantId.mockResolvedValue([
      pendingInvitation('new.owner@example.com', { expiresAt: new Date(Date.now() - 60_000) }),
      pendingInvitation('someone.else@example.com'),
    ]);

    await expect(invite()).resolves.toEqual(expect.objectContaining({ email: 'new.owner@example.com' }));
    expect(invitationRepository.create).toHaveBeenCalled();
  });

  // The invitation row is the record that matters; mail delivery is
  // best-effort, exactly as in InviteStaffUseCase.
  it('still succeeds when the invitation email fails to send', async () => {
    emailSender.sendInvitationEmail.mockRejectedValue(new Error('smtp down'));

    await expect(invite()).resolves.toEqual(expect.objectContaining({ email: 'new.owner@example.com' }));
  });

  describe('platform-admin invitations (no tenantId, role SUPER_ADMIN)', () => {
    const invitePlatformAdmin = (over: any = {}) =>
      useCase.execute({
        callerRole: UserRole.SUPER_ADMIN,
        callerId: CALLER,
        email: 'new.admin@example.com',
        role: UserRole.SUPER_ADMIN,
        ...over,
      });

    it('creates a tenant-less invitation without looking up a tenant', async () => {
      const result = await invitePlatformAdmin();

      expect(result.role).toBe(UserRole.SUPER_ADMIN);
      expect(tenantRepository.findById).not.toHaveBeenCalled();
      const created = invitationRepository.create.mock.calls[0][0];
      expect(created.tenantId).toBeNull();
      expect(created.role).toBe(UserRole.SUPER_ADMIN);
    });

    it('dedupes against the whole platform, not a single workspace', async () => {
      await invitePlatformAdmin();

      expect(userRepository.findAnyByEmail).toHaveBeenCalledWith('new.admin@example.com');
      expect(userRepository.findByEmail).not.toHaveBeenCalled();
    });

    it('refuses when the email is already in use anywhere on the platform', async () => {
      userRepository.findAnyByEmail.mockResolvedValue(
        User.create({
          id: 'existing-admin',
          email: 'new.admin@example.com',
          hashedPassword: 'h',
          role: UserRole.SUPER_ADMIN,
          tenantId: null,
          createdAt: new Date(),
        })
      );

      await expect(invitePlatformAdmin()).rejects.toThrow(EmailAlreadyInUseError);
      expect(invitationRepository.create).not.toHaveBeenCalled();
    });

    it('refuses a second invitation while one is still pending', async () => {
      invitationRepository.findByTenantId.mockResolvedValue([
        Invitation.create({
          id: 'inv-2',
          tenantId: null,
          email: 'new.admin@example.com',
          role: UserRole.SUPER_ADMIN,
          token: 'tok2',
          expiresAt: new Date(Date.now() + 60_000),
          acceptedAt: null,
        }),
      ]);

      await expect(invitePlatformAdmin()).rejects.toThrow(InvitationAlreadyPendingError);
      expect(invitationRepository.findByTenantId).toHaveBeenCalledWith(null);
    });

    it('sends the invitation email without a tenant name', async () => {
      const result = await invitePlatformAdmin();

      expect(emailSender.sendInvitationEmail).toHaveBeenCalledWith(
        'new.admin@example.com',
        result.token,
        undefined
      );
    });

    it('rejects a caller-provided tenantId alongside the SUPER_ADMIN role', async () => {
      await expect(invitePlatformAdmin({ tenantId: TENANT })).rejects.toThrow(UnauthorizedError);
      expect(invitationRepository.create).not.toHaveBeenCalled();
    });

    it('still refuses a non-SUPER_ADMIN caller', async () => {
      await expect(
        invitePlatformAdmin({ callerRole: UserRole.BUSINESS_OWNER })
      ).rejects.toThrow(UnauthorizedError);
    });
  });
});
