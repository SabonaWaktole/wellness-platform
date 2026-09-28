import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AccessContext } from '../../../access/domain/AccessContext';
import { IQuotationRepository } from '../../domain/IQuotationRepository';
import { QuotationStatus } from '../../domain/Quotation';

export class SearchQuotationsUseCase {
  constructor(
    private quotationRepo: IQuotationRepository,
    private scopes: RecordScopeResolver
  ) {}

  async execute(input: {
    tenantId: string;
    actingUserId: string;
    access: AccessContext;
    params: {
      query?: string;
      status?: QuotationStatus;
      clientId?: string;
      page?: number;
      limit?: number;
    };
  }) {
    const page = input.params.page || 1;
    const limit = input.params.limit || 10;

    // Only quotations of companies in the viewer's scope, filtered in the
    // query so the count matches the page (FR-RBAC-11, 13).
    const scope = await this.scopes.resolve(input.access, 'quotations.manage');

    const result = await this.quotationRepo.search({
      tenantId: input.tenantId,
      query: input.params.query,
      status: input.params.status,
      clientId: input.params.clientId,
      scope,
      page,
      limit
    });

    return result;
  }
}
