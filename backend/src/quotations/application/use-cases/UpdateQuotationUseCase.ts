import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AccessContext } from '../../../access/domain/AccessContext';
import { reachableQuotation } from './quotationAccess';
import { IQuotationRepository } from '../../domain/IQuotationRepository';
import { IQuotationLineItemRepository } from '../../domain/IQuotationLineItemRepository';
import { IProductRepository, IWarehouseRepository, IStockLevelRepository } from '../../../inventory/domain/repositories';
import { QuotationLineItem } from '../../domain/QuotationLineItem';
import { QuotationStatus } from '../../domain/Quotation';
import { QuotationStatusHistory } from '../../domain/QuotationStatusHistory';
import { IQuotationWriteTransaction } from '../ports/IQuotationWriteTransaction';
import { IQuotationDeliveryService } from '../QuotationDeliveryService';
import { assertStockAvailable } from '../assertQuotationStockAvailable';

export class UpdateQuotationUseCase {
  constructor(
    private quotationRepo: IQuotationRepository,
    private lineItemRepo: IQuotationLineItemRepository,
    private productRepo: IProductRepository,
    private warehouseRepo: IWarehouseRepository,
    private stockLevelRepo: IStockLevelRepository,
    private writeTx: IQuotationWriteTransaction,
    private scopes: RecordScopeResolver,
    private delivery?: IQuotationDeliveryService
  ) {}

  async execute(input: {
    tenantId: string;
    quotationId: string;
    actingUserId: string;
    access: AccessContext;
    lineItems: Array<{ productId: string; warehouseId: string; quantity: number; unitPrice: number }>;
  }) {
    const scope = await this.scopes.resolve(input.access, 'quotations.manage');
    const quotation = await this.quotationRepo.findById(input.tenantId, input.quotationId);
    if (!quotation) {
      throw new Error('Quotation not found');
    }

    reachableQuotation(quotation, scope);

    /*
     * Rejected is editable too, on top of Draft — the client said no to
     * something, and the fix for that is revising it, not starting over. When
     * it is Rejected, a successful save also puts it back in front of the
     * client (see `isResend` below): that is what "the client rejected it, I
     * fixed it, they should see the fix" means in practice, and matches what
     * the SRS calls "Re-quote" (§6.5).
     */
    if (quotation.status !== QuotationStatus.Draft && quotation.status !== QuotationStatus.Rejected) {
      throw new Error('Only Draft or Rejected quotations can be updated');
    }

    if (!input.lineItems || input.lineItems.length === 0) {
      throw new Error('A quotation must have at least one line item');
    }

    const newLineItems: QuotationLineItem[] = [];

    for (const li of input.lineItems) {
      const product = await this.productRepo.findById(input.tenantId, li.productId);
      if (!product) {
        throw new Error(`Product ${li.productId} not found`);
      }
      if (product.tenantId !== input.tenantId) {
        throw new Error(`Product ${li.productId} does not belong to this tenant`);
      }

      const warehouse = await this.warehouseRepo.findById(input.tenantId, li.warehouseId);
      if (!warehouse) {
        throw new Error(`Warehouse ${li.warehouseId} not found`);
      }
      if (warehouse.tenantId !== input.tenantId) {
        throw new Error(`Warehouse ${li.warehouseId} does not belong to this tenant`);
      }

      newLineItems.push(
        QuotationLineItem.create({
          id: crypto.randomUUID(),
          tenantId: input.tenantId,
          quotationId: input.quotationId,
          productId: li.productId,
          warehouseId: li.warehouseId,
          quantity: li.quantity,
          unitPrice: li.unitPrice
        })
      );
    }

    const isResend = quotation.status === QuotationStatus.Rejected;

    // Refuses the resend before anything is written, same as Submit/Approve —
    // a revision that goes back out to the client must reflect what can
    // actually be fulfilled with today's pricing AND today's stock.
    if (isResend) {
      await assertStockAvailable(input.tenantId, newLineItems, this.stockLevelRepo);
    }

    quotation.lineItems = newLineItems;

    await this.lineItemRepo.deleteManyByQuotationId(input.tenantId, input.quotationId);
    await this.lineItemRepo.saveMany(newLineItems);

    if (isResend) {
      const fromStatus = quotation.status;
      quotation.resend(); // Rejected -> Sent

      const history = QuotationStatusHistory.create({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        quotationId: input.quotationId,
        fromStatus,
        toStatus: quotation.status,
        changedByUserId: input.actingUserId
      });

      // Quotation and history commit together, same as every other status
      // transition — otherwise a failure between the two writes would leave a
      // quotation reading SENT with no record of how it got there.
      await this.writeTx.run(async (repos) => {
        await repos.quotationRepo.save(quotation);
        await repos.historyRepo.save(history);
      });

      // The token is never reissued (`issueShareToken`'s own guard) and
      // resolves to current state, so the client's original link already
      // shows the revision — this email is what tells them to go look again.
      await this.delivery?.deliverToClient(quotation.shareToken);
    } else {
      await this.quotationRepo.save(quotation);
    }

    return { quotation };
  }
}
