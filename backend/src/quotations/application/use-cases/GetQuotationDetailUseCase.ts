import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AccessContext } from '../../../access/domain/AccessContext';
import { reachableQuotation } from './quotationAccess';
import { IQuotationRepository } from '../../domain/IQuotationRepository';
import { IQuotationLineItemRepository } from '../../domain/IQuotationLineItemRepository';
import { IQuotationStatusHistoryRepository } from '../../domain/IQuotationStatusHistoryRepository';
import { IInvoiceRepository } from '../../../invoices/domain/IInvoiceRepository';
import { QuotationStatus } from '../../domain/Quotation';

export class GetQuotationDetailUseCase {
  constructor(
    private quotationRepo: IQuotationRepository,
    private lineItemRepo: IQuotationLineItemRepository,
    private historyRepo: IQuotationStatusHistoryRepository,
    private scopes: RecordScopeResolver,
    // Optional: existing callers (and tests) that construct this use case
    // without an invoice repository still work, just with `invoiceId` always
    // null. Only the real HTTP wiring needs to pass one.
    private invoiceRepo?: IInvoiceRepository
  ) {}

  async execute(input: {
    tenantId: string;
    quotationId: string;
    actingUserId: string;
    access: AccessContext;
  }) {
    const quotation = await this.quotationRepo.findById(input.tenantId, input.quotationId);
    if (!quotation) {
      throw new Error('Quotation not found');
    }

    reachableQuotation(quotation, await this.scopes.resolve(input.access, 'quotations.manage'));

    const lineItems = await this.lineItemRepo.findByQuotationId(input.tenantId, input.quotationId);
    const history = await this.historyRepo.findByQuotationId(input.tenantId, input.quotationId);

    // Reaching the quotation (checked above) is what acting on it needs;
    // approving it takes quotations.approve on top.
    const canApprove = input.access.can('quotations.approve');
    const permittedActions: string[] = [];

    switch (quotation.status) {
      case QuotationStatus.Draft:
        permittedActions.push('EDIT', 'SUBMIT');
        break;
      case QuotationStatus.PendingApproval:
        if (canApprove) {
          permittedActions.push('APPROVE', 'RETURN_TO_DRAFT');
        }
        break;
      case QuotationStatus.Sent:
        permittedActions.push('MARK_ACCEPTED', 'MARK_REJECTED', 'EXPIRE');
        break;
      case QuotationStatus.Rejected:
        // Revising a Rejected quotation and saving it resends it — see
        // UpdateQuotationUseCase.
        permittedActions.push('EDIT');
        break;
    }

    /*
     * Whether this quotation has already been converted to an invoice — the
     * frontend uses this to show "Convert to Invoice" only when the answer is
     * no. `findByQuotationId` returns at most one row: the DB enforces
     * one-quotation-to-at-most-one-invoice via a unique constraint.
     */
    const invoice = this.invoiceRepo
      ? await this.invoiceRepo.findByQuotationId(input.tenantId, input.quotationId)
      : null;

    return { quotation, lineItems, history, permittedActions, invoiceId: invoice?.id ?? null };
  }
}
