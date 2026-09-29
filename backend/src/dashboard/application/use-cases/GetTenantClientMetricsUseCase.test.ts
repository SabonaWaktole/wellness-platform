import { GetTenantClientMetricsUseCase } from './GetTenantClientMetricsUseCase';
import { IClientRepository } from '../../../clients/domain/repositories/IClientRepository';
import { Client } from '../../../clients/domain/entities/Client';
import { ClientStatus } from '../../../clients/domain/enums/ClientStatus';
import { INotificationSettingsRepository } from '../../../notifications/domain/INotificationSettingsRepository';
import { NotificationSettings } from '../../../notifications/domain/NotificationSettings';
import { administrator, salesManager, salesUser, scopeResolver } from '../../../../tests/support/access';

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
      countByName: jest.fn(),
      findByTaxId: jest.fn(),
    };

    // Unconfigured tenant: the repository answers with the domain defaults,
    // which is what every read site sees in practice.
    mockSettingsRepository = {
      get: jest.fn(async (tenantId: string) => NotificationSettings.defaults(tenantId)),
      save: jest.fn(),
      listAll: jest.fn(),
    };

    useCase = new GetTenantClientMetricsUseCase(mockClientRepository, mockSettingsRepository, scopeResolver());
  });

  it('reports the follow-up threshold the workspace is configured with', async () => {
    mockClientRepository.countByTenant.mockResolvedValue(0);
    mockClientRepository.search.mockResolvedValue({ items: [], total: 0 });

    const result = await useCase.execute({ tenantId: 'tenant-1', timeZone: 'Europe/Tirane', access: administrator() });

    expect(mockSettingsRepository.get).toHaveBeenCalledWith('tenant-1');
    expect(result.followUpThresholdDays).toBe(3);
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
      Client.create({ id: 'c1', tenantId, name: 'Client 1', status: ClientStatus.CLIENT, createdAt: tenDaysAgo, ...baseProps }, []),
      Client.create({ id: 'c2', tenantId, name: 'Client 2', status: ClientStatus.CLIENT, createdAt: tenDaysAgo, ...baseProps }, []),
      Client.create({ id: 'c3', tenantId, name: 'Client 3', status: ClientStatus.CLIENT, createdAt: twoDaysAgo, ...baseProps }, []),
    ];

    mockClientRepository.countByTenant.mockResolvedValue(3);
    mockClientRepository.search.mockResolvedValue({ items: mockClients, total: 3 });

    const result = await useCase.execute({ tenantId, timeZone: 'Europe/Tirane', access: administrator({ userId: 'u1' }) });

    // Total clients should be 3
    expect(result.totalClients).toBe(3);
    // Last week's clients should be 2 (c1, c2)
    expect(result.totalClientsLastWeek).toBe(2);

    expect(mockClientRepository.search).toHaveBeenCalledWith(tenantId, { scope: { kind: 'all' } }, 0, 10000);
  });

  describe('scope-based scoping (FR-RBAC-13)', () => {
    beforeEach(() => {
      mockClientRepository.search.mockResolvedValue({ items: [], total: 2 });
    });

    it('counts a Sales User\'s companies within their own scope, in the query', async () => {
      const result = await useCase.execute({
        tenantId: 'tenant-1', timeZone: 'Europe/Tirane', access: salesUser({ userId: 'staff-1' }),
      });

      expect(mockClientRepository.search).toHaveBeenCalledWith(
        'tenant-1',
        { scope: { kind: 'owners', userIds: ['staff-1'], includeUnowned: false } },
        0,
        10000
      );
      expect(result.totalClients).toBe(2);
    });

    it('counts a Sales Manager\'s companies across the team and the unassigned ones', async () => {
      const withTeam = new GetTenantClientMetricsUseCase(
        mockClientRepository,
        mockSettingsRepository,
        scopeResolver(['su-1', 'su-2'])
      );
      await withTeam.execute({ tenantId: 'tenant-1', timeZone: 'Europe/Tirane', access: salesManager({ userId: 'sm-1' }) });

      expect(mockClientRepository.search).toHaveBeenCalledWith(
        'tenant-1',
        { scope: { kind: 'owners', userIds: ['su-1', 'su-2', 'sm-1'], includeUnowned: true } },
        0,
        10000
      );
    });
  });

  it('should enforce cross-tenant isolation by passing only the requested tenantId to the repository', async () => {
    const tenantId = 'tenant-isolated';

    mockClientRepository.countByTenant.mockResolvedValue(0);
    mockClientRepository.search.mockResolvedValue({ items: [], total: 0 });

    await useCase.execute({ tenantId, timeZone: 'Europe/Tirane', access: administrator({ userId: 'u1' }) });

    // Verify the repository is queried ONLY for the requested tenant
    expect(mockClientRepository.search).toHaveBeenCalledWith(tenantId, expect.any(Object), expect.any(Number), expect.any(Number));
  });
});
