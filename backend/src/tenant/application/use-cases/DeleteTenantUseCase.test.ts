import { DeleteTenantUseCase } from './DeleteTenantUseCase';
import { ITenantRepository } from '../../domain/repositories/ITenantRepository';
import { ITenantDeletionTransaction } from '../ports/ITenantDeletionTransaction';
import { ITenantMediaCleaner } from '../ports/ITenantMediaCleaner';
import { Tenant } from '../../domain/entities/Tenant';
import { UnauthorizedError } from '../../../auth/domain/errors';
import { UserRole } from '../../../auth/domain/enums/UserRole';
import { TenantNotFoundError, ConfirmationMismatchError } from '../../domain/errors';

describe('DeleteTenantUseCase', () => {
  let useCase: DeleteTenantUseCase;
  let mockTenantRepo: jest.Mocked<ITenantRepository>;
  let mockDeletionTx: jest.Mocked<ITenantDeletionTransaction>;
  let mockMediaCleaner: jest.Mocked<ITenantMediaCleaner>;

  const tenant = Tenant.create({
    id: 't1',
    name: 'Acme',
    urlSlug: 'acme',
    createdAt: new Date(),
  });

  beforeEach(() => {
    mockTenantRepo = {
      findById: jest.fn(),
      findBySlug: jest.fn(),
      create: jest.fn(),
      findAll: jest.fn(),
      updateSettings: jest.fn(),
      updateSettingsForMany: jest.fn(),
      setSubscriptionStatus: jest.fn(),
      setSalesWorkflow: jest.fn(),
    };
    mockDeletionTx = { run: jest.fn() };
    mockMediaCleaner = { removeAll: jest.fn() };
    useCase = new DeleteTenantUseCase(mockTenantRepo, mockDeletionTx, mockMediaCleaner);
  });

  it('throws UnauthorizedError for a non-SUPER_ADMIN caller and touches nothing', async () => {
    await expect(
      useCase.execute({ callerId: 'u1', callerRole: UserRole.BUSINESS_OWNER, tenantId: 't1', confirmSlug: 'acme' })
    ).rejects.toThrow(UnauthorizedError);
    expect(mockTenantRepo.findById).not.toHaveBeenCalled();
    expect(mockDeletionTx.run).not.toHaveBeenCalled();
  });

  it('throws TenantNotFoundError when the tenant does not exist', async () => {
    mockTenantRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ callerId: 'u1', callerRole: UserRole.SUPER_ADMIN, tenantId: 'nope', confirmSlug: 'anything' })
    ).rejects.toThrow(TenantNotFoundError);
    expect(mockDeletionTx.run).not.toHaveBeenCalled();
  });

  it('throws ConfirmationMismatchError when confirmSlug does not match, and deletes nothing', async () => {
    mockTenantRepo.findById.mockResolvedValue(tenant);

    await expect(
      useCase.execute({ callerId: 'u1', callerRole: UserRole.SUPER_ADMIN, tenantId: 't1', confirmSlug: 'wrong-slug' })
    ).rejects.toThrow(ConfirmationMismatchError);
    expect(mockDeletionTx.run).not.toHaveBeenCalled();
    expect(mockMediaCleaner.removeAll).not.toHaveBeenCalled();
  });

  it('deletes the database rows before cleaning up media, on a matching confirmation', async () => {
    mockTenantRepo.findById.mockResolvedValue(tenant);
    const callOrder: string[] = [];
    mockDeletionTx.run.mockImplementation(async () => {
      callOrder.push('db');
    });
    mockMediaCleaner.removeAll.mockImplementation(async () => {
      callOrder.push('media');
    });

    await useCase.execute({ callerId: 'u1', callerRole: UserRole.SUPER_ADMIN, tenantId: 't1', confirmSlug: 'acme' });

    expect(mockDeletionTx.run).toHaveBeenCalledWith('t1');
    expect(mockMediaCleaner.removeAll).toHaveBeenCalledWith('t1');
    expect(callOrder).toEqual(['db', 'media']);
  });

  it('does not fail the whole operation when media cleanup throws', async () => {
    mockTenantRepo.findById.mockResolvedValue(tenant);
    mockMediaCleaner.removeAll.mockRejectedValue(new Error('disk error'));

    await expect(
      useCase.execute({ callerId: 'u1', callerRole: UserRole.SUPER_ADMIN, tenantId: 't1', confirmSlug: 'acme' })
    ).resolves.toBeUndefined();
    expect(mockDeletionTx.run).toHaveBeenCalledWith('t1');
  });

  it('does not clean up media when the database deletion itself fails', async () => {
    mockTenantRepo.findById.mockResolvedValue(tenant);
    mockDeletionTx.run.mockRejectedValue(new Error('fk violation'));

    await expect(
      useCase.execute({ callerId: 'u1', callerRole: UserRole.SUPER_ADMIN, tenantId: 't1', confirmSlug: 'acme' })
    ).rejects.toThrow('fk violation');
    expect(mockMediaCleaner.removeAll).not.toHaveBeenCalled();
  });
});
