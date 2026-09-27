import { AccessContext } from '../../../access/domain/AccessContext';
import { assertReachesQuotation } from './quotationAccess';
import { IQuotationRepository } from '../../domain/IQuotationRepository';
import { IQuotationLineItemRepository } from '../../domain/IQuotationLineItemRepository';
import { IQuotationStatusHistoryRepository } from '../../domain/IQuotationStatusHistoryRepository';
import { IStockLevelRepository, IStockTransactionManager } from '../../../inventory/domain/repositories';
import { QuotationStatusHistory } from '../../domain/QuotationStatusHistory';
import { StockMovement, StockMovementType } from '../../../inventory/domain/StockMovement';
import { IQuotationWriteTransaction } from '../ports/IQuotationWriteTransaction';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { IUserRepository } from '../../../auth/domain/repositories/IUserRepository';
import { quotationReference } from '../../domain/quotationReference';
import { runWithPostCommitEmail, IPostCommitEmailDispatcher } from '../runWithPostCommitEmail';
import { assertStockAvailable } from '../assertQuotationStockAvailable';

export class MarkQuotationAcceptedUseCase {
  constructor(
    private quotationRepo: IQuotationRepository,
    private lineItemRepo: IQuotationLineItemRepository,
    private historyRepo: IQuotationStatusHistoryRepository,
    private stockLevelRepo: IStockLevelRepository,
    private transactionManager: IStockTransactionManager,
    private writeTx: IQuotationWriteTransaction,
    private userRepo: IUserRepository,
    private emailDispatcher?: IPostCommitEmailDispatcher
  ) {}

  /**
   * @param input.actingUserId  NULL means the client, acting through their
   *   public quotation link rather than a staff member — see
   *   RespondToPublicQuotationUseCase. Stock movements still need a real user
   *   for their `createdBy` FK, so that write attributes to the quotation's
   *   own creator (`stockActorId` below); only the status history and
   *   notification, which have no such constraint, record the NULL and read
   *   as the client's own action.
   */
  async execute(input: {
    tenantId: string;
    quotationId: string;
    actingUserId: string | null;
    access: AccessContext | null;
  }) {
    const quotation = await this.quotationRepo.findById(input.tenantId, input.quotationId);
    if (!quotation) {
      throw new Error('Quotation not found');
    }

    assertReachesQuotation(quotation, input.access);

    const stockActorId = input.actingUserId ?? quotation.createdByUserId;

    const fromStatus = quotation.status;
    quotation.accept(); // Throws if not Sent

    const lineItems = await this.lineItemRepo.findByQuotationId(input.tenantId, input.quotationId);
    await assertStockAvailable(input.tenantId, lineItems, this.stockLevelRepo);

    await this.transactionManager.executeTransaction(async (repos) => {
      for (const li of lineItems) {
        const stock = await repos.stockLevelRepository.findByProductAndWarehouse(input.tenantId, li.productId, li.warehouseId);
        if (!stock) {
          throw new Error(`Stock level not found for product ${li.productId} at warehouse ${li.warehouseId}`);
        }

        // Deduct stock
        stock.quantity -= li.quantity;
        await repos.stockLevelRepository.save(stock);

        // Record stock movement (ADJUSTMENT negative)
        const movement = StockMovement.create({
          id: crypto.randomUUID(),
          tenantId: input.tenantId,
          productId: li.productId,
          warehouseId: li.warehouseId,
          quantity: -li.quantity,
          type: StockMovementType.ADJUSTMENT,
          reason: `Quotation ${input.quotationId} accepted`,
          createdBy: stockActorId
        });
        await repos.stockMovementRepository.save(movement);
      }
    });

    const history = QuotationStatusHistory.create({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      quotationId: input.quotationId,
      fromStatus,
      toStatus: quotation.status,
      changedByUserId: input.actingUserId
    });

    /*
     * Quotation, history and notification commit together.
     *
     * The stock deduction above stays in its OWN transaction, sequentially,
     * exactly as before. Prisma rejects a nested interactive transaction, and
     * merging the two would mean rewriting the stock path — a change to
     * inventory correctness that has no business riding along with a
     * notification feature. So the pre-existing boundary between "stock moved"
     * and "quotation marked accepted" is unchanged; what is fixed is the
     * boundary *within* the quotation writes, which used to be two independent
     * awaits. Noted in TD-032.
     */
    await runWithPostCommitEmail(this.writeTx, this.emailDispatcher, async (repos, notify) => {
      await repos.quotationRepo.save(quotation);
      await repos.historyRepo.save(history);

      const notifications = new NotificationService(repos.notificationRepo, this.userRepo);
      notify(
        await notifications.emit({
          tenantId: input.tenantId,
          recipientUserIds: [quotation.createdByUserId],
          type: 'QUOTATION_ACCEPTED',
          params: { reference: quotationReference(quotation.id) },
          actorUserId: input.actingUserId,
          entityType: 'QUOTATION',
          entityId: quotation.id,
        })
      );
    });

    return { quotation };
  }
}
