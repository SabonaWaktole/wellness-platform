import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { InvoiceStatusHistory } from '../../domain/InvoiceStatusHistory';
import { IInvoiceWriteTransaction } from '../ports/IInvoiceWriteTransaction';

export class SendInvoiceUseCase {
  constructor(private writeTx: IInvoiceWriteTransaction) {}

  async execute(input: {
    tenantId: string;
    invoiceId: string;
    actingUserId: string;
    access: AccessContext;
  }) {
    return this.writeTx.run(async (repos) => {
      const invoice = await repos.invoiceRepo.findById(input.tenantId, input.invoiceId);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (!input.access.reaches('invoices.manage', [invoice.createdByUserId])) {
        throw new PermissionDeniedError('invoices.manage', 'Unauthorized: you can only act on your own invoices');
      }

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
