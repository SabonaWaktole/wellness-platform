import { AccessContext } from '../../../access/domain/AccessContext';
import { assertReachesQuotation } from './quotationAccess';
import { QuotationStatusHistory } from '../../domain/QuotationStatusHistory';
import { IQuotationWriteTransaction } from '../ports/IQuotationWriteTransaction';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { IUserRepository } from '../../../auth/domain/repositories/IUserRepository';
import { quotationReference } from '../../domain/quotationReference';
import { runWithPostCommitEmail, IPostCommitEmailDispatcher } from '../runWithPostCommitEmail';

export class MarkQuotationRejectedUseCase {
  constructor(
    private writeTx: IQuotationWriteTransaction,
    private userRepo: IUserRepository,
    private emailDispatcher?: IPostCommitEmailDispatcher
  ) {}

  /**
   * @param input.actingUserId  NULL means the client, acting through their
   *   public quotation link rather than a staff member — see
   *   RespondToPublicQuotationUseCase. Unlike Accept, nothing here has a
   *   not-null FK to a user, so NULL flows straight through to the history row
   *   and the notification, both of which read as the client's own action.
   * @param input.note  Shown in the quotation's status history. Used for the
   *   client's "Re-quote" reason as well as an optional staff-entered reason
   *   when marking a quotation rejected by hand.
   */
  async execute(input: {
    tenantId: string;
    quotationId: string;
    actingUserId: string | null;
    access: AccessContext | null;
    note?: string | null;
  }) {
    return runWithPostCommitEmail(this.writeTx, this.emailDispatcher, async (repos, notify) => {
      const quotation = await repos.quotationRepo.findById(input.tenantId, input.quotationId);
      if (!quotation) {
        throw new Error('Quotation not found');
      }

      assertReachesQuotation(quotation, input.access);

      const fromStatus = quotation.status;
      quotation.reject();

      const history = QuotationStatusHistory.create({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        quotationId: input.quotationId,
        fromStatus,
        toStatus: quotation.status,
        changedByUserId: input.actingUserId,
        note: input.note ?? null
      });

      await repos.quotationRepo.save(quotation);
      await repos.historyRepo.save(history);

      /*
       * The client said no; the creator is the person who follows that up.
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
          type: 'QUOTATION_REJECTED',
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
