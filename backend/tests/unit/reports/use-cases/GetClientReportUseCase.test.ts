import { administrator, salesUser, scopeResolver } from '../../../support/access';
import { GetClientReportUseCase } from '../../../../src/reports/application/use-cases/GetClientReportUseCase';
import { IReportRepository } from '../../../../src/reports/domain/IReportRepository';

describe('GetClientReportUseCase', () => {
  it('should return client status distribution', async () => {
    const mockRepo: IReportRepository = {
      getMonthlyRevenue: jest.fn(),
      getClientStatusDistribution: jest.fn().mockResolvedValue([
        { status: 'ACTIVE', count: 10 },
        { status: 'PROSPECT', count: 5 }
      ]),
      getInventoryValueByWarehouse: jest.fn(),
      getNewClientsTrend: jest.fn(),
      getAppointmentStatusDistribution: jest.fn(),
      getAppointmentsByStaff: jest.fn(),
      getLowStockItems: jest.fn()
    };

    const useCase = new GetClientReportUseCase(mockRepo, scopeResolver());
    const result = await useCase.execute('tenant-1', salesUser({ userId: 'su-1' }));

    expect(result).toHaveLength(2);
    expect(result[0].count).toBe(10);
    expect(mockRepo.getClientStatusDistribution).toHaveBeenCalledWith('tenant-1', { kind: 'owners', userIds: ['su-1'], includeUnowned: false });
  });

  it('should throw if tenantId is missing', async () => {
    const mockRepo: IReportRepository = {
      getMonthlyRevenue: jest.fn(),
      getClientStatusDistribution: jest.fn(),
      getInventoryValueByWarehouse: jest.fn(),
      getNewClientsTrend: jest.fn(),
      getAppointmentStatusDistribution: jest.fn(),
      getAppointmentsByStaff: jest.fn(),
      getLowStockItems: jest.fn()
    };

    const useCase = new GetClientReportUseCase(mockRepo, scopeResolver());
    await expect(useCase.execute('', administrator())).rejects.toThrow('Tenant ID is required');
  });
});
