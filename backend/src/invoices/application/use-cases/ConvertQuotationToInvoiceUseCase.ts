import { AccessContext } from '../../../access/domain/AccessContext';
import { assertReachesQuotation } from '../../../quotations/application/use-cases/quotationAccess';
import { IQuotationRepository } from '../../../quotations/domain/IQuotationRepository';
import { IQuotationLineItemRepository } from '../../../quotations/domain/IQuotationLineItemRepository';
import { QuotationStatus } from '../../../quotations/domain/Quotation';
import { IInvoiceRepository } from '../../domain/IInvoiceRepository';
import { Invoice } from '../../domain/Invoice';
import { InvoiceLineItem } from '../../domain/InvoiceLineItem';
import { InvoiceStatusHistory } from '../../domain/InvoiceStatusHistory';
import { IInvoiceWriteTransaction } from '../ports/IInvoiceWriteTransaction';

const DEFAULT_DUE_DAYS = 30;

/**
 * Converts an ACCEPTED Quotation into a Draft Invoice.
 *
 * Only reachable from ACCEPTED — a quotation still being negotiated has no
 * business becoming a bill, and both the approval step and the stock
 * deduction that a quotation goes through already happened on the way to
 * ACCEPTED (`MarkQuotationAcceptedUseCase`), so neither is repeated here.
 *
 * Line items are copied, not referenced. A quotation can in principle keep
 * existing after conversion, and an invoice must never silently reprice
 * itself because someone edited the quotation it came from — the invoice is
 * a snapshot of what was agreed at the moment of conversion.
 *
 * One Quotation converts to at most one Invoice — enforced here (a defensive
 * check) and by a `@unique` constraint on `Invoice.quotationId` at the
 * database (the actual guarantee under concurrency).
 */
export class ConvertQuotationToInvoiceUseCase {
  constructor(
    private quotationRepo: IQuotationRepository,
    private quotationLineItemRepo: IQuotationLineItemRepository,
    private invoiceRepo: IInvoiceRepository,
    private writeTx: IInvoiceWriteTransaction
  ) {}

  async execute(input: {
    tenantId: string;
    quotationId: string;
    actingUserId: string;
    access: AccessContext;
    dueDate?: Date;
  }) {
    const quotation = await this.quotationRepo.findById(input.tenantId, input.quotationId);
    if (!quotation) {
      throw new Error('Quotation not found');
    }

    assertReachesQuotation(quotation, input.access);

    if (quotation.status !== QuotationStatus.Accepted) {
      throw new Error('Only an accepted quotation can be converted to an invoice');
    }

    const existing = await this.invoiceRepo.findByQuotationId(input.tenantId, input.quotationId);
    if (existing) {
      throw new Error('An invoice already exists for this quotation');
    }

    const quotationLineItems = await this.quotationLineItemRepo.findByQuotationId(
      input.tenantId,
      input.quotationId
    );

    const invoiceId = crypto.randomUUID();
    const dueDate = input.dueDate ?? new Date(Date.now() + DEFAULT_DUE_DAYS * 24 * 60 * 60_000);

    const lineItems = quotationLineItems.map((li) =>
      InvoiceLineItem.create({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        invoiceId,
        productId: li.productId,
        warehouseId: li.warehouseId,
        quantity: li.quantity,
        unitPrice: li.unitPrice
      })
    );

    const invoice = Invoice.create({
      id: invoiceId,
      tenantId: input.tenantId,
      clientId: quotation.clientId,
      quotationId: quotation.id,
      createdByUserId: input.actingUserId,
      lineItems,
      dueDate
    });

    const history = InvoiceStatusHistory.create({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      invoiceId,
      fromStatus: 'NONE',
      toStatus: invoice.status,
      changedByUserId: input.actingUserId,
      note: `Converted from quotation ${input.quotationId}`
    });

    await this.writeTx.run(async (repos) => {
      await repos.invoiceRepo.save(invoice);
      await repos.lineItemRepo.saveMany(lineItems);
      await repos.historyRepo.save(history);
    });

    return { invoice };
  }
}
