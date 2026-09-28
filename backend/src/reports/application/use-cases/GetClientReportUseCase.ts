import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { IReportRepository, ClientStatusCount } from '../../domain/IReportRepository';

export class GetClientReportUseCase {
  constructor(
    private readonly reportRepository: IReportRepository,
    private readonly scopes: RecordScopeResolver
  ) {}

  /** The status mix of the companies in the viewer's `companies.view` scope (FR-RBAC-13). */
  async execute(tenantId: string, access: AccessContext): Promise<ClientStatusCount[]> {
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    const scope = await this.scopes.resolve(access, 'companies.view');
    return this.reportRepository.getClientStatusDistribution(tenantId, scope);
  }
}
