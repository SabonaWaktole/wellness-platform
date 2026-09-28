import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AccessContext } from '../../../access/domain/AccessContext';
import { reachableInvoice } from './invoiceAccess';
import { IInvoiceRepository } from '../../domain/IInvoiceRepository';
import { IInvoiceLineItemRepository } from '../../domain/IInvoiceLineItemRepository';
import { IInvoiceStatusHistoryRepository } from '../../domain/IInvoiceStatusHistoryRepository';
import { InvoiceStatus } from '../../domain/Invoice';

export class GetInvoiceDetailUseCase {
  constructor(
    private invoiceRepo: IInvoiceRepository,
    private lineItemRepo: IInvoiceLineItemRepository,
    private historyRepo: IInvoiceStatusHistoryRepository,
    private scopes: RecordScopeResolver
  ) {}

  async execute(input: {
    tenantId: string;
    invoiceId: string;
    actingUserId: string;
    access: AccessContext;
  }) {
    const invoice = await this.invoiceRepo.findById(input.tenantId, input.invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    reachableInvoice(invoice, await this.scopes.resolve(input.access, 'invoices.manage'));

    const lineItems = await this.lineItemRepo.findByInvoiceId(input.tenantId, input.invoiceId);
    const history = await this.historyRepo.findByInvoiceId(input.tenantId, input.invoiceId);

    // Reaching the invoice (checked above) is what acting on it needs.
    const permittedActions: string[] = [];
    switch (invoice.status) {
      case InvoiceStatus.Draft:
        permittedActions.push('SEND', 'VOID');
        break;
      case InvoiceStatus.Sent:
      case InvoiceStatus.Overdue:
        permittedActions.push('MARK_PAID', 'VOID');
        break;
    }

    return { invoice, lineItems, history, permittedActions };
  }
}
