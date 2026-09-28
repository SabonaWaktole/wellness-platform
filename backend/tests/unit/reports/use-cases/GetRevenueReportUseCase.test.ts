import { accessWith, administrator, salesManager, scopeResolver } from '../../../support/access';
import { PermissionDeniedError } from '../../../../src/access/domain/errors';
import { GetRevenueReportUseCase } from '../../../../src/reports/application/use-cases/GetRevenueReportUseCase';
import { IReportRepository } from '../../../../src/reports/domain/IReportRepository';

describe('GetRevenueReportUseCase', () => {
  it('should return monthly revenue from the repository', async () => {
    const mockRepo: IReportRepository = {
      getMonthlyRevenue: jest.fn().mockResolvedValue([
        { month: '2026-06', revenue: 5000 },
        { month: '2026-07', revenue: 7500 }
      ]),
      getClientStatusDistribution: jest.fn(),
      getInventoryValueByWarehouse: jest.fn(),
      getNewClientsTrend: jest.fn(),
      getAppointmentStatusDistribution: jest.fn(),
      getAppointmentsByStaff: jest.fn(),
      getLowStockItems: jest.fn()
    };

    const useCase = new GetRevenueReportUseCase(mockRepo, scopeResolver());
    const result = await useCase.execute('tenant-1', 12, administrator());

    expect(result).toHaveLength(2);
    expect(result[1].revenue).toBe(7500);
    expect(mockRepo.getMonthlyRevenue).toHaveBeenCalledWith('tenant-1', 12, { kind: 'all' });
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

    const useCase = new GetRevenueReportUseCase(mockRepo, scopeResolver());
    await expect(useCase.execute('', 12, administrator())).rejects.toThrow('Tenant ID is required');
  });

  it('should throw if limitMonths is invalid', async () => {
    const mockRepo: IReportRepository = {
      getMonthlyRevenue: jest.fn(),
      getClientStatusDistribution: jest.fn(),
      getInventoryValueByWarehouse: jest.fn(),
      getNewClientsTrend: jest.fn(),
      getAppointmentStatusDistribution: jest.fn(),
      getAppointmentsByStaff: jest.fn(),
      getLowStockItems: jest.fn()
    };

    const useCase = new GetRevenueReportUseCase(mockRepo, scopeResolver());
    await expect(useCase.execute('tenant-1', 0, administrator())).rejects.toThrow('Limit months must be between 1 and 60');
    await expect(useCase.execute('tenant-1', 61, administrator())).rejects.toThrow('Limit months must be between 1 and 60');
  });

  const repoWith = () => ({
    getMonthlyRevenue: jest.fn().mockResolvedValue([]),
    getClientStatusDistribution: jest.fn(),
    getInventoryValueByWarehouse: jest.fn(),
    getNewClientsTrend: jest.fn(),
    getAppointmentStatusDistribution: jest.fn(),
    getAppointmentsByStaff: jest.fn(),
    getLowStockItems: jest.fn(),
  });

  it('FR-RBAC-13 sums only the revenue of companies in the viewer\'s scope', async () => {
    const repo = repoWith();
    await new GetRevenueReportUseCase(repo, scopeResolver(['su-1'])).execute(
      'tenant-1', 6, salesManager({ userId: 'sm-1', grant: { 'reports.view': true } })
    );

    expect(repo.getMonthlyRevenue).toHaveBeenCalledWith('tenant-1', 6, {
      kind: 'owners', userIds: ['su-1', 'sm-1'], includeUnowned: true,
    });
  });

  it('FR-RBAC-06 refuses revenue to a viewer without commercial.view', async () => {
    const repo = repoWith();
    await expect(
      new GetRevenueReportUseCase(repo, scopeResolver()).execute('tenant-1', 6, accessWith({ 'reports.view': true }))
    ).rejects.toThrow(PermissionDeniedError);
    expect(repo.getMonthlyRevenue).not.toHaveBeenCalled();
  });
});
