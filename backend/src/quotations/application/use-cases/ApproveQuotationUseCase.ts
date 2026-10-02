import { AccessContext } from '../../../access/domain/AccessContext';
import { QuotationStatusHistory } from '../../domain/QuotationStatusHistory';
import { IQuotationWriteTransaction } from '../ports/IQuotationWriteTransaction';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { IUserRepository } from '../../../auth/domain/repositories/IUserRepository';
import { quotationReference } from '../../domain/quotationReference';
import { runWithPostCommitEmail, IPostCommitEmailDispatcher } from '../runWithPostCommitEmail';
import { generateShareToken } from '../../domain/shareToken';
import { IQuotationDeliveryService } from '../QuotationDeliveryService';
import { IQuotationLineItemRepository } from '../../domain/IQuotationLineItemRepository';
import { IStockLevelRepository } from '../../../inventory/domain/repositories';
import { assertQuotationStockAvailable } from '../assertQuotationStockAvailable';

export class ApproveQuotationUseCase {
  constructor(
    private writeTx: IQuotationWriteTransaction,
    private userRepo: IUserRepository,
    private lineItemRepo: IQuotationLineItemRepository,
    private stockLevelRepo: IStockLevelRepository,
    private emailDispatcher?: IPostCommitEmailDispatcher,
    private delivery?: IQuotationDeliveryService
  ) {}

  async execute(input: {
    tenantId: string;
    quotationId: string;
    actingUserId: string;
    access: AccessContext;
  }) {
    // Authorisation before the transaction opens: an unauthorised caller must
    // not cause a database round trip, and the error must not depend on
    // whether the quotation they named happens to exist.
    input.access.ensure('quotations.approve');

    const result = await runWithPostCommitEmail(this.writeTx, this.emailDispatcher, async (repos, notify) => {
      const quotation = await repos.quotationRepo.findById(input.tenantId, input.quotationId);
      if (!quotation) {
        throw new Error('Quotation not found');
      }

      const fromStatus = quotation.status;
      quotation.approve();

      // The other route into SENT, so it runs the same pre-flight stock check
      // Submit does on its own direct route there — stock can have moved in
      // the time a quotation sat waiting for approval. Before
      // `issueShareToken`, so a refusal here never mints a customer link.
      await assertQuotationStockAvailable(input.tenantId, input.quotationId, this.lineItemRepo, this.stockLevelRepo);

      // Approval is the other route into SENT, so it mints the customer link
      // too. Both routes call the same guarded method rather than one of them
      // being the place the link "really" comes from.
      quotation.issueShareToken(generateShareToken());

      const history = QuotationStatusHistory.create({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        quotationId: input.quotationId,
        fromStatus,
        toStatus: quotation.status,
        changedByUserId: input.actingUserId
      });

      await repos.quotationRepo.save(quotation);
      await repos.historyRepo.save(history);

      /*
       * The creator asked for this approval; they are the one waiting on it.
       *
       * Inside the transaction: quotation, history and notification commit
       * together or not at all. The two writes above were previously
       * independent awaits, so a failure between them left a quotation whose
       * own history did not record how it got there.
       *
       * `emit` drops a recipient who is the actor, so a Business Owner acting
       * on their own quotation does not notify themselves.
       */
      const notifications = new NotificationService(repos.notificationRepo, this.userRepo);
      notify(
        await notifications.emit({
          tenantId: input.tenantId,
          recipientUserIds: [quotation.createdByUserId],
          type: 'QUOTATION_APPROVED',
          params: { reference: quotationReference(quotation) },
          actorUserId: input.actingUserId,
          entityType: 'QUOTATION',
          entityId: quotation.id,
        })
      );

      return { quotation };
    });

    // Approval is the moment the customer is meant to receive it, so this is
    // where the approval branch delivers. `approve()` has already guaranteed
    // the status is Sent, so there is nothing to check.
    await this.delivery?.deliverToClient(result.quotation.shareToken);

    return result;
  }
}
