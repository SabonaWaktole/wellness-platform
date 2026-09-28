import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AccessContext } from '../../../access/domain/AccessContext';
import { IInvoiceRepository } from '../../domain/IInvoiceRepository';
import { InvoiceStatus } from '../../domain/Invoice';

export class SearchInvoicesUseCase {
  constructor(
    private invoiceRepo: IInvoiceRepository,
    private scopes: RecordScopeResolver
  ) {}

  async execute(input: {
    tenantId: string;
    actingUserId: string;
    access: AccessContext;
    params: {
      query?: string;
      status?: InvoiceStatus;
      clientId?: string;
      page?: number;
      limit?: number;
    };
  }) {
    const page = input.params.page || 1;
    const limit = input.params.limit || 10;

    // Only invoices of companies in the viewer's scope, filtered in the query
    // so the count matches the page (FR-RBAC-11, 13).
    const scope = await this.scopes.resolve(input.access, 'invoices.manage');
    const result = await this.invoiceRepo.search({
      tenantId: input.tenantId,
      scope,
      query: input.params.query,
      status: input.params.status,
      clientId: input.params.clientId,
      page,
      limit
    });

    return result;
  }
}
