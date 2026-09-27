import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AccessContext } from '../../../access/domain/AccessContext';
import { reachableInvoice } from './invoiceAccess';
import { InvoiceStatusHistory } from '../../domain/InvoiceStatusHistory';
import { IInvoiceWriteTransaction } from '../ports/IInvoiceWriteTransaction';

export class SendInvoiceUseCase {
  constructor(
    private writeTx: IInvoiceWriteTransaction,
    private scopes: RecordScopeResolver
  ) {}

  async execute(input: {
    tenantId: string;
    invoiceId: string;
    actingUserId: string;
    access: AccessContext;
  }) {
    const scope = await this.scopes.resolve(input.access, 'invoices.manage');
    return this.writeTx.run(async (repos) => {
      const invoice = await repos.invoiceRepo.findById(input.tenantId, input.invoiceId);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      reachableInvoice(invoice, scope);

      const fromStatus = invoice.status;
      invoice.send();

      const history = InvoiceStatusHistory.create({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        invoiceId: input.invoiceId,
        fromStatus,
        toStatus: invoice.status,
        changedByUserId: input.actingUserId
      });

      await repos.invoiceRepo.save(invoice);
      await repos.historyRepo.save(history);

      return { invoice };
    });
  }
}
