import { NotificationService } from '../../../src/notifications/application/NotificationService';
import { INotificationRepository } from '../../../src/notifications/domain/INotificationRepository';
import { IUserRepository } from '../../../src/auth/domain/repositories/IUserRepository';
import { User } from '../../../src/auth/domain/entities/User';
import { UserRole } from '../../../src/auth/domain/enums/UserRole';

/**
 * The three rules NotificationService exists to centralise. Each is tested
 * here rather than at eleven emitting sites, which is the point of having the
 * service at all.
 */
describe('NotificationService', () => {
  let notificationRepo: jest.Mocked<INotificationRepository>;
  let userRepo: jest.Mocked<IUserRepository>;
  let service: NotificationService;

  const makeUser = (over: Partial<{ id: string; tenantId: string; role: UserRole; isActive: boolean }> = {}) =>
    User.create({
      id: over.id ?? 'u1',
      email: `${over.id ?? 'u1'}@test`,
      hashedPassword: 'hash',
      role: over.role ?? UserRole.STAFF,
      tenantId: over.tenantId ?? 'tenant-1',
      isActive: over.isActive ?? true,
    } as any);

  const saved = () =>
    (notificationRepo.saveMany as jest.Mock).mock.calls.flatMap(([batch]) => batch);

  beforeEach(() => {
    notificationRepo = {
      saveMany: jest.fn().mockResolvedValue(undefined),
      findForRecipient: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
      pruneForRecipient: jest.fn(),
    } as unknown as jest.Mocked<INotificationRepository>;

    userRepo = {
      findById: jest.fn().mockImplementation(async (id: string) => makeUser({ id })),
      findActiveByTenantAndRole: jest.fn().mockResolvedValue([]),
      findPlatformUsers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      countActivePlatformAdmins: jest.fn().mockResolvedValue(1),
    } as unknown as jest.Mocked<IUserRepository>;

    service = new NotificationService(notificationRepo, userRepo);
  });

  const base = {
    tenantId: 'tenant-1',
    type: 'CLIENT_ASSIGNED' as const,
    params: { client: 'Acme' },
  };

  describe('rule 1 â€” never notify the actor about their own action', () => {
    it('drops the actor from an explicit recipient list', async () => {
      await service.emit({ ...base, recipientUserIds: ['u1'], actorUserId: 'u1' });

      expect(notificationRepo.saveMany).not.toHaveBeenCalled();
    });

    it('keeps other recipients when the actor is among them', async () => {
      await service.emit({ ...base, recipientUserIds: ['u1', 'u2'], actorUserId: 'u1' });

      expect(saved().map((n: any) => n.recipientUserId)).toEqual(['u2']);
    });

    it('drops the actor from a role fan-out too', async () => {
      // The realistic case: a Business Owner submits a quotation that needs
      // Business Owner approval. They should not be told about their own.
      userRepo.findActiveByTenantAndRole.mockResolvedValue([
        makeUser({ id: 'owner-1', role: UserRole.BUSINESS_OWNER }),
        makeUser({ id: 'owner-2', role: UserRole.BUSINESS_OWNER }),
      ]);

      await service.emit({ ...base, toRole: UserRole.BUSINESS_OWNER, actorUserId: 'owner-1' });

      expect(saved().map((n: any) => n.recipientUserId)).toEqual(['owner-2']);
    });
  });

  describe('rule 2 â€” never notify a deactivated user (TD-010)', () => {
    it('drops an explicitly named recipient who is deactivated', async () => {
      // Their token stays valid for up to an hour after deactivation, so the
      // filter has to be on the record, not on whoever is calling.
      userRepo.findById.mockResolvedValue(makeUser({ id: 'u2', isActive: false }));

      await service.emit({ ...base, recipientUserIds: ['u2'], actorUserId: 'u1' });

      expect(notificationRepo.saveMany).not.toHaveBeenCalled();
    });

    it('keeps active recipients alongside deactivated ones', async () => {
      userRepo.findById.mockImplementation(async (id: string) =>
        makeUser({ id, isActive: id !== 'gone' })
      );

      await service.emit({ ...base, recipientUserIds: ['gone', 'here'], actorUserId: 'u1' });

      expect(saved().map((n: any) => n.recipientUserId)).toEqual(['here']);
    });

    it('relies on the repository filter for role fan-out', async () => {
      await service.emit({ ...base, toRole: UserRole.BUSINESS_OWNER, actorUserId: 'u1' });

      expect(userRepo.findActiveByTenantAndRole).toHaveBeenCalledWith('tenant-1', UserRole.BUSINESS_OWNER);
    });
  });

  describe('tenant isolation', () => {
    it('refuses a recipient who belongs to another tenant', async () => {
      // Checked on the record, so a caller cannot address a notification into
      // another workspace by supplying an id from it.
      userRepo.findById.mockResolvedValue(makeUser({ id: 'outsider', tenantId: 'tenant-2' }));

      await service.emit({ ...base, recipientUserIds: ['outsider'], actorUserId: 'u1' });

      expect(notificationRepo.saveMany).not.toHaveBeenCalled();
    });

    it('stamps the emitting tenant on every row', async () => {
      await service.emit({ ...base, recipientUserIds: ['u2'], actorUserId: 'u1' });

      expect(saved().every((n: any) => n.tenantId === 'tenant-1')).toBe(true);
    });
  });

  describe('fan-out shape', () => {
    it('writes one row per recipient', async () => {
      userRepo.findActiveByTenantAndRole.mockResolvedValue([
        makeUser({ id: 'a' }), makeUser({ id: 'b' }), makeUser({ id: 'c' }),
      ]);

      await service.emit({ ...base, toRole: UserRole.BUSINESS_OWNER, actorUserId: 'z' });

      expect(saved()).toHaveLength(3);
    });

    it('de-duplicates a recipient named both explicitly and by role', async () => {
      userRepo.findActiveByTenantAndRole.mockResolvedValue([makeUser({ id: 'a' })]);

      await service.emit({
        ...base,
        recipientUserIds: ['a'],
        toRole: UserRole.BUSINESS_OWNER,
        actorUserId: 'z',
      });

      expect(saved()).toHaveLength(1);
    });

    it('writes nothing rather than an empty batch when there is nobody to tell', async () => {
      await service.emit({ ...base, recipientUserIds: [], actorUserId: 'u1' });

      expect(notificationRepo.saveMany).not.toHaveBeenCalled();
    });
  });

  describe('rule 3 â€” emitSafe never breaks its caller', () => {
    it('swallows a repository failure', async () => {
      notificationRepo.saveMany.mockRejectedValue(new Error('database on fire'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      // A saved appointment must not be lost because its notification failed.
      await expect(
        service.emitSafe({ ...base, recipientUserIds: ['u2'], actorUserId: 'u1' })
      ).resolves.toBeUndefined();
    });

    it('emit itself still throws, so a transaction can roll back on it', async () => {
      notificationRepo.saveMany.mockRejectedValue(new Error('database on fire'));

      await expect(
        service.emit({ ...base, recipientUserIds: ['u2'], actorUserId: 'u1' })
      ).rejects.toThrow('database on fire');
    });
  });

  it('carries the deep-link target through to the row', async () => {
    await service.emit({
      ...base,
      recipientUserIds: ['u2'],
      actorUserId: 'u1',
      entityType: 'CLIENT',
      entityId: 'client-9',
    });

    expect(saved()[0]).toMatchObject({ entityType: 'CLIENT', entityId: 'client-9' });
  });

  it('stores the key and params, never a rendered sentence (TD-016)', async () => {
    await service.emit({ ...base, recipientUserIds: ['u2'], actorUserId: 'u1' });

    const row = saved()[0];
    expect(row.type).toBe('CLIENT_ASSIGNED');
    expect(row.params).toEqual({ client: 'Acme' });
  });
});
