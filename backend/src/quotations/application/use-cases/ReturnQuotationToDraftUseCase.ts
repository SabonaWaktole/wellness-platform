import { AccessContext } from '../../../access/domain/AccessContext';
import { QuotationStatusHistory } from '../../domain/QuotationStatusHistory';
import { IQuotationWriteTransaction } from '../ports/IQuotationWriteTransaction';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { IUserRepository } from '../../../auth/domain/repositories/IUserRepository';
import { quotationReference } from '../../domain/quotationReference';
import { runWithPostCommitEmail, IPostCommitEmailDispatcher } from '../runWithPostCommitEmail';

export class ReturnQuotationToDraftUseCase {
  constructor(
    private writeTx: IQuotationWriteTransaction,
    private userRepo: IUserRepository,
    private emailDispatcher?: IPostCommitEmailDispatcher
  ) {}

  async execute(input: {
    tenantId: string;
    quotationId: string;
    actingUserId: string;
    access: AccessContext;
    reason?: string;
  }) {
    // Authorisation before the transaction opens: an unauthorised caller must
    // not cause a database round trip, and the error must not depend on
    // whether the quotation they named happens to exist.
    input.access.ensure('quotations.approve');

    return runWithPostCommitEmail(this.writeTx, this.emailDispatcher, async (repos, notify) => {
      const quotation = await repos.quotationRepo.findById(input.tenantId, input.quotationId);
      if (!quotation) {
        throw new Error('Quotation not found');
      }

      const fromStatus = quotation.status;
      quotation.returnToDraft();

      const history = QuotationStatusHistory.create({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        quotationId: input.quotationId,
        fromStatus,
        toStatus: quotation.status,
        changedByUserId: input.actingUserId,
        // The owner's reason for handing it back, shown in status history.
        note: input.reason
      });

      await repos.quotationRepo.save(quotation);
      await repos.historyRepo.save(history);

      /*
       * A rejection back to draft is work handed back to the creator.
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
          type: 'QUOTATION_RETURNED_TO_DRAFT',
          params: { reference: quotationReference(quotation.id) },
          actorUserId: input.actingUserId,
          entityType: 'QUOTATION',
          entityId: quotation.id,
        })
      );

      return { quotation };
    });
  }
}
