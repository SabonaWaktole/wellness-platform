import { AccessContext } from '../../../access/domain/AccessContext';
import { IQuotationRepository } from '../../domain/IQuotationRepository';

export class GetPendingApprovalsUseCase {
  constructor(private quotationRepo: IQuotationRepository) {}

  async execute(input: {
    tenantId: string;
    access: AccessContext;
  }) {
    input.access.ensure('quotations.approve');

    const quotations = await this.quotationRepo.findPendingApprovals(input.tenantId);
    return { quotations };
  }
}
