import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AccessContext } from '../../../access/domain/AccessContext';
import { reachableQuotation } from './quotationAccess';
import { QuotationStatusHistory } from '../../domain/QuotationStatusHistory';
import { IQuotationWriteTransaction } from '../ports/IQuotationWriteTransaction';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { IUserRepository } from '../../../auth/domain/repositories/IUserRepository';
import { quotationReference } from '../../domain/quotationReference';
import { runWithPostCommitEmail, IPostCommitEmailDispatcher } from '../runWithPostCommitEmail';

export class ExpireQuotationUseCase {
  constructor(
    private writeTx: IQuotationWriteTransaction,
    private userRepo: IUserRepository,
    private scopes: RecordScopeResolver,
    private emailDispatcher?: IPostCommitEmailDispatcher
  ) {}

  /**
   * @param input.actingUserId  NULL means the scheduler, not a person. The
   *   automatic-expiry sweep passes NULL so the history row records that no
   *   human made the change, and so `emit` does not treat the quotation's own
   *   creator as the actor and therefore skip notifying them.
   */
  async execute(input: {
    tenantId: string;
    quotationId: string;
    actingUserId: string | null;
    access: AccessContext | null;
  }) {
    const scope = input.access ? await this.scopes.resolve(input.access, 'quotations.manage') : null;
    return runWithPostCommitEmail(this.writeTx, this.emailDispatcher, async (repos, notify) => {
      const quotation = await repos.quotationRepo.findById(input.tenantId, input.quotationId);
      if (!quotation) {
        throw new Error('Quotation not found');
      }

      reachableQuotation(quotation, scope);

      const fromStatus = quotation.status;
      quotation.expire();

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
       * Expiry is a state change nobody chose; the creator should know it lapsed.
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
          type: 'QUOTATION_EXPIRED',
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
