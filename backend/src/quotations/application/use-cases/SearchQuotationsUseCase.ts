import { AccessContext } from '../../../access/domain/AccessContext';
import { IQuotationRepository } from '../../domain/IQuotationRepository';
import { QuotationStatus } from '../../domain/Quotation';

export class SearchQuotationsUseCase {
  constructor(private quotationRepo: IQuotationRepository) {}

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

    // At OWN scope a caller sees only the quotations they created.
    const createdByUserId = input.access.ownOnly('quotations.manage') ? input.access.userId : undefined;

    const result = await this.quotationRepo.search({
      tenantId: input.tenantId,
      query: input.params.query,
      status: input.params.status,
      clientId: input.params.clientId,
      createdByUserId,
      page,
      limit
    });

    return result;
  }
}
