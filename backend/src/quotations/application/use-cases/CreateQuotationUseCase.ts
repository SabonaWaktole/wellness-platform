import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AccessContext } from '../../../access/domain/AccessContext';
import { IQuotationRepository } from '../../domain/IQuotationRepository';
import { IQuotationLineItemRepository } from '../../domain/IQuotationLineItemRepository';
import { IQuotationStatusHistoryRepository } from '../../domain/IQuotationStatusHistoryRepository';
import { IClientRepository } from '../../../clients/domain/repositories/IClientRepository';
import { IProductRepository, IWarehouseRepository } from '../../../inventory/domain/repositories';
import { Quotation } from '../../domain/Quotation';
import { QuotationLineItem } from '../../domain/QuotationLineItem';
import { QuotationStatusHistory } from '../../domain/QuotationStatusHistory';

export class CreateQuotationUseCase {
  constructor(
    private quotationRepo: IQuotationRepository,
    private lineItemRepo: IQuotationLineItemRepository,
    private historyRepo: IQuotationStatusHistoryRepository,
    private clientRepo: IClientRepository,
    private productRepo: IProductRepository,
    private warehouseRepo: IWarehouseRepository,
    private scopes: RecordScopeResolver
  ) {}

  async execute(input: {
    tenantId: string;
    clientId: string;
    createdByUserId: string;
    lineItems: Array<{ productId: string; warehouseId: string; quantity: number; unitPrice: number }>;
    access: AccessContext;
  }) {
    input.access.ensure('quotations.manage');

    // Only for a company inside the viewer's scope (FR-RBAC-11); outside it
    // the company is not found.
    const scope = await this.scopes.resolve(input.access, 'quotations.manage');
    const client = await this.clientRepo.findById(input.tenantId, input.clientId, { scope });
    if (!client) {
      throw new Error('Client not found');
    }
    if (client.tenantId !== input.tenantId) {
      throw new Error('Client does not belong to this tenant');
    }

    const quotationId = crypto.randomUUID();
    const lineItems: QuotationLineItem[] = [];

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

      lineItems.push(
        QuotationLineItem.create({
          id: crypto.randomUUID(),
          tenantId: input.tenantId,
          quotationId,
          productId: li.productId,
          warehouseId: li.warehouseId,
          quantity: li.quantity,
          unitPrice: li.unitPrice
        })
      );
    }

    const quotation = Quotation.create({
      id: quotationId,
      tenantId: input.tenantId,
      clientId: input.clientId,
      createdByUserId: input.createdByUserId,
      lineItems
    });

    await this.quotationRepo.save(quotation);
    await this.lineItemRepo.saveMany(lineItems);

    const history = QuotationStatusHistory.create({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      quotationId,
      fromStatus: 'NONE',
      toStatus: quotation.status,
      changedByUserId: input.createdByUserId
    });
    await this.historyRepo.save(history);

    return { quotation };
  }
}
