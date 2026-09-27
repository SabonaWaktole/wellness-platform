import { AccessContext } from '../../../access/domain/AccessContext';
import { IInvoiceRepository } from '../../domain/IInvoiceRepository';
import { InvoiceStatus } from '../../domain/Invoice';

export class SearchInvoicesUseCase {
  constructor(private invoiceRepo: IInvoiceRepository) {}

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

    const result = await this.invoiceRepo.search({
      tenantId: input.tenantId,
      query: input.params.query,
      status: input.params.status,
      clientId: input.params.clientId,
      page,
      limit
    });

    return result;
  }
}
