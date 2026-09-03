import { ArchiveClientUseCase } from '../../../../../src/clients/application/use-cases/ArchiveClientUseCase';
import { RestoreClientUseCase } from '../../../../../src/clients/application/use-cases/RestoreClientUseCase';
import { IClientRepository } from '../../../../../src/clients/domain/repositories/IClientRepository';
import { Client } from '../../../../../src/clients/domain/entities/Client';
import { UserRole } from '../../../../../src/auth/domain/enums/UserRole';

const client = (deletedAt: Date | null = null) =>
  Client.reconstitute({
    id: 'c1',
    tenantId: 't1',
    name: 'Acme Ltd',
    contactInfo: {},
    status: 'ACTIVE',
    customFieldValues: {},
    lastUpdatedByUserId: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt,
  });

describe('ArchiveClientUseCase', () => {
  let repo: jest.Mocked<IClientRepository>;
  let archive: ArchiveClientUseCase;
  let restore: RestoreClientUseCase;

  beforeEach(() => {
    repo = {
      findById: jest.fn().mockResolvedValue(client()),
      countRelatedRecords: jest.fn().mockResolvedValue({ interactions: 2, appointments: 1, quotations: 0, invoices: 3 }),
      archive: jest.fn(),
      restore: jest.fn(),
    } as any;
    archive = new ArchiveClientUseCase(repo);
    restore = new RestoreClientUseCase(repo);
  });

  const owner = { tenantId: 't1', requestingUserRole: UserRole.BUSINESS_OWNER, requestingUserId: 'u1', clientId: 'c1' };

  it('archives the client and reports what was preserved', async () => {
    const result = await archive.execute(owner);

    expect(repo.archive).toHaveBeenCalledWith('t1', 'c1', 'u1');
    expect(result.archivedClientName).toBe('Acme Ltd');
    expect(result.preserved).toEqual({ interactions: 2, appointments: 1, quotations: 0, invoices: 3 });
  });

  it('refuses staff', async () => {
    await expect(archive.execute({ ...owner, requestingUserRole: UserRole.STAFF }))
      .rejects.toThrow('Only Business Owners can delete clients');
    expect(repo.archive).not.toHaveBeenCalled();
  });

  it('allows super admin', async () => {
    await archive.execute({ ...owner, requestingUserRole: UserRole.SUPER_ADMIN });
    expect(repo.archive).toHaveBeenCalled();
  });

  it('404s for a client in another tenant', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(archive.execute(owner)).rejects.toThrow('Client not found');
    expect(repo.archive).not.toHaveBeenCalled();
  });

  it('never hard-deletes — no delete method is called', async () => {
    await archive.execute(owner);
    expect((repo as any).delete).toBeUndefined();
  });

  describe('restore', () => {
    it('brings an archived client back', async () => {
      repo.findById.mockResolvedValue(client(new Date()));
      const result = await restore.execute(owner);
      expect(repo.findById).toHaveBeenCalledWith('t1', 'c1', { includeArchived: true });
      expect(repo.restore).toHaveBeenCalledWith('t1', 'c1', 'u1');
      expect(result.restoredClientName).toBe('Acme Ltd');
    });

    it('rejects restoring a client that is not archived', async () => {
      repo.findById.mockResolvedValue(client(null));
      await expect(restore.execute(owner)).rejects.toThrow('Client is not archived');
      expect(repo.restore).not.toHaveBeenCalled();
    });

    it('refuses staff', async () => {
      repo.findById.mockResolvedValue(client(new Date()));
      await expect(restore.execute({ ...owner, requestingUserRole: UserRole.STAFF }))
        .rejects.toThrow('Only Business Owners can restore clients');
    });
  });
});
