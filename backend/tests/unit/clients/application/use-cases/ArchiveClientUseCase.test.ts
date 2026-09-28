import { ArchiveClientUseCase } from '../../../../../src/clients/application/use-cases/ArchiveClientUseCase';
import { RestoreClientUseCase } from '../../../../../src/clients/application/use-cases/RestoreClientUseCase';
import { IClientRepository } from '../../../../../src/clients/domain/repositories/IClientRepository';
import { Client } from '../../../../../src/clients/domain/entities/Client';
import { accessWith, administrator, platformOperator, salesManager, salesUser, scopeResolver } from '../../../../support/access';
import { PermissionDeniedError } from '../../../../../src/access/domain/errors';

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
    archive = new ArchiveClientUseCase(repo, scopeResolver());
    restore = new RestoreClientUseCase(repo, scopeResolver());
  });

  const owner = { tenantId: 't1', access: administrator(), requestingUserId: 'u1', clientId: 'c1' };

  it('archives the client and reports what was preserved', async () => {
    const result = await archive.execute(owner);

    expect(repo.archive).toHaveBeenCalledWith('t1', 'c1', 'u1');
    expect(result.archivedClientName).toBe('Acme Ltd');
    expect(result.preserved).toEqual({ interactions: 2, appointments: 1, quotations: 0, invoices: 3 });
  });

  it('refuses staff', async () => {
    await expect(archive.execute({ ...owner, access: salesUser() }))
      .rejects.toThrow(PermissionDeniedError);
    expect(repo.archive).not.toHaveBeenCalled();
  });

  it('FR-RBAC-05 allows any role holding companies.delete, not just the Administrator', async () => {
    await archive.execute({ ...owner, access: salesManager() });
    expect(repo.archive).toHaveBeenCalled();
  });

  it('FR-RBAC-05 refuses an Administrator whose role no longer holds companies.delete', async () => {
    await expect(archive.execute({ ...owner, access: administrator({ revoke: ['companies.delete'] }) }))
      .rejects.toThrow(PermissionDeniedError);
    await expect(restore.execute({ ...owner, access: accessWith({ 'companies.view': 'ALL' as any }) }))
      .rejects.toThrow(PermissionDeniedError);
  });

  it('allows super admin', async () => {
    await archive.execute({ ...owner, access: platformOperator() });
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
      expect(repo.findById).toHaveBeenCalledWith('t1', 'c1', { includeArchived: true, scope: { kind: 'all' } });
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
      await expect(restore.execute({ ...owner, access: salesUser() }))
        .rejects.toThrow(PermissionDeniedError);
    });
  });
});
