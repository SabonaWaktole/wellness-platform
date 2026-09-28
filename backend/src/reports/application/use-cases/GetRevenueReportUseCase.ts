import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { IReportRepository, MonthlyRevenue } from '../../domain/IReportRepository';

export class GetRevenueReportUseCase {
  constructor(
    private readonly reportRepository: IReportRepository,
    private readonly scopes: RecordScopeResolver
  ) {}

  /**
   * Revenue from the companies in the viewer's `companies.view` scope
   * (FR-RBAC-13). It is nothing but money, so without `commercial.view` it is
   * refused outright rather than returned empty (FR-RBAC-06).
   */
  async execute(tenantId: string, limitMonths: number, access: AccessContext): Promise<MonthlyRevenue[]> {
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    
    if (limitMonths <= 0 || limitMonths > 60) {
      throw new Error('Limit months must be between 1 and 60');
    }

    access.ensure('commercial.view');
    const scope = await this.scopes.resolve(access, 'companies.view');
    return this.reportRepository.getMonthlyRevenue(tenantId, limitMonths, scope);
  }
}
