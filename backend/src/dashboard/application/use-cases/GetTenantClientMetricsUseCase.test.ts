import { GetTenantClientMetricsUseCase } from './GetTenantClientMetricsUseCase';
import { IClientRepository } from '../../../clients/domain/repositories/IClientRepository';
import { Client } from '../../../clients/domain/entities/Client';
import { ClientStatus } from '../../../clients/domain/enums/ClientStatus';
import { INotificationSettingsRepository } from '../../../notifications/domain/INotificationSettingsRepository';
import { NotificationSettings } from '../../../notifications/domain/NotificationSettings';

describe('GetTenantClientMetricsUseCase', () => {
  let mockClientRepository: jest.Mocked<IClientRepository>;
  let mockSettingsRepository: jest.Mocked<INotificationSettingsRepository>;
  let useCase: GetTenantClientMetricsUseCase;

  beforeEach(() => {
    mockClientRepository = {
      findById: jest.fn(),
      search: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      countByTenant: jest.fn(),
      findRecentByTenant: jest.fn(),
      backfillLegacyBasicFields: jest.fn(),
      archive: jest.fn(),
      restore: jest.fn(),
      countRelatedRecords: jest.fn(),
      renameCustomFieldKey: jest.fn(),
    };

    // Unconfigured tenant: the repository answers with the domain defaults,
    // which is what every read site sees in practice.
    mockSettingsRepository = {
      get: jest.fn(async (tenantId: string) => NotificationSettings.defaults(tenantId)),
      save: jest.fn(),
      listAll: jest.fn(),
    };

    useCase = new GetTenantClientMetricsUseCase(mockClientRepository, mockSettingsRepository);
  });

  it('reports the follow-up threshold the workspace is configured with', async () => {
    mockClientRepository.countByTenant.mockResolvedValue(0);
    mockClientRepository.search.mockResolvedValue({ items: [], total: 0 });

    const result = await useCase.execute({ tenantId: 'tenant-1', timeZone: 'Europe/Tirane' });

    expect(mockSettingsRepository.get).toHaveBeenCalledWith('tenant-1');
    expect(result.followUpThresholdDays).toBe(3);
  });

  it('reports zero assigned clients when the caller is not identified', async () => {
    mockClientRepository.countByTenant.mockResolvedValue(5);
    mockClientRepository.search.mockResolvedValue({ items: [], total: 0 });

    // No userId means no personal book of business — the count must not widen
    // into "every client in the tenant".
    const result = await useCase.execute({ tenantId: 'tenant-1', timeZone: 'Europe/Tirane' });

    expect(result.assignedClients).toBe(0);
  });

  it('should return correct totalClients and totalClientsLastWeek', async () => {
    const tenantId = 'tenant-1';
    
    // Create some fake dates
    const now = new Date();
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(now.getDate() - 2);
    
    const tenDaysAgo = new Date(now);
    tenDaysAgo.setDate(now.getDate() - 10);
    
    const baseProps = {
      contactInfo: {},
      customFieldValues: {},
      lastUpdatedByUserId: 'u1',
      updatedAt: now,
    };

    // Mock 3 clients total. 2 are old (created > 7 days ago), 1 is new (created 2 days ago).
    const mockClients = [
      Client.create({ id: 'c1', tenantId, name: 'Client 1', status: ClientStatus.ACTIVE, createdAt: tenDaysAgo, ...baseProps }, []),
      Client.create({ id: 'c2', tenantId, name: 'Client 2', status: ClientStatus.ACTIVE, createdAt: tenDaysAgo, ...baseProps }, []),
      Client.create({ id: 'c3', tenantId, name: 'Client 3', status: ClientStatus.ACTIVE, createdAt: twoDaysAgo, ...baseProps }, []),
    ];

    mockClientRepository.countByTenant.mockResolvedValue(3);
    mockClientRepository.search.mockResolvedValue({ items: mockClients, total: 3 });

    const result = await useCase.execute({ tenantId, timeZone: 'Europe/Tirane', userId: 'u1', role: 'BUSINESS_OWNER' });

    // Total clients should be 3
    expect(result.totalClients).toBe(3);
    // Last week's clients should be 2 (c1, c2)
    expect(result.totalClientsLastWeek).toBe(2);

    expect(mockClientRepository.countByTenant).toHaveBeenCalledWith(tenantId);
    expect(mockClientRepository.search).toHaveBeenCalledWith(tenantId, {}, 0, 10000);
  });

  describe('role-based scoping', () => {
    beforeEach(() => {
      mockClientRepository.countByTenant.mockResolvedValue(9);
      mockClientRepository.search.mockResolvedValue({ items: [], total: 2 });
    });

    it('scopes client figures to the requesting user when role is STAFF', async () => {
      const result = await useCase.execute({
        tenantId: 'tenant-1', timeZone: 'Europe/Tirane',
        userId: 'staff-1',
        role: 'STAFF',
      });

      expect(mockClientRepository.search).toHaveBeenCalledWith(
        'tenant-1',
        { assignedUserId: 'staff-1' },
        0,
        10000
      );
      // Scoped total comes from the filtered search, not the tenant-wide count.
      expect(result.totalClients).toBe(2);
      expect(mockClientRepository.countByTenant).not.toHaveBeenCalled();
    });

    it('does NOT scope for BUSINESS_OWNER', async () => {
      const result = await useCase.execute({
        tenantId: 'tenant-1', timeZone: 'Europe/Tirane',
        userId: 'owner-1',
        role: 'BUSINESS_OWNER',
      });

      expect(mockClientRepository.search).toHaveBeenCalledWith('tenant-1', {}, 0, 10000);
      expect(result.totalClients).toBe(9);
    });

    it('does not scope when no role is supplied (defaults to tenant-wide)', async () => {
      await useCase.execute({ tenantId: 'tenant-1', timeZone: 'Europe/Tirane' });

      expect(mockClientRepository.search).toHaveBeenCalledWith('tenant-1', {}, 0, 10000);
    });

    it('ignores userId when the role is not STAFF', async () => {
      await useCase.execute({ tenantId: 'tenant-1', timeZone: 'Europe/Tirane', userId: 'owner-1', role: 'BUSINESS_OWNER' });

      expect(mockClientRepository.search).toHaveBeenCalledWith('tenant-1', {}, 0, 10000);
    });
  });

  it('should enforce cross-tenant isolation by passing only the requested tenantId to the repository', async () => {
    const tenantId = 'tenant-isolated';

    mockClientRepository.countByTenant.mockResolvedValue(0);
    mockClientRepository.search.mockResolvedValue({ items: [], total: 0 });

    await useCase.execute({ tenantId, timeZone: 'Europe/Tirane', userId: 'u1', role: 'BUSINESS_OWNER' });

    // Verify the repository is queried ONLY for the requested tenant
    expect(mockClientRepository.countByTenant).toHaveBeenCalledWith(tenantId);
    expect(mockClientRepository.search).toHaveBeenCalledWith(tenantId, expect.any(Object), expect.any(Number), expect.any(Number));
  });
});
