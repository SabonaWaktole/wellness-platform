import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AccessContext } from '../../../access/domain/AccessContext';
import { reachableQuotation } from './quotationAccess';
import { QuotationStatusHistory } from '../../domain/QuotationStatusHistory';
import { UserRole } from '../../../auth/domain/enums/UserRole';
import { IQuotationWriteTransaction } from '../ports/IQuotationWriteTransaction';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { IUserRepository } from '../../../auth/domain/repositories/IUserRepository';
import { quotationReference } from '../../domain/quotationReference';
import { runWithPostCommitEmail, IPostCommitEmailDispatcher } from '../runWithPostCommitEmail';
import { generateShareToken } from '../../domain/shareToken';
import { IQuotationDeliveryService } from '../QuotationDeliveryService';
import { QuotationStatus } from '../../domain/Quotation';
import { IQuotationLineItemRepository } from '../../domain/IQuotationLineItemRepository';
import { IStockLevelRepository } from '../../../inventory/domain/repositories';
import { assertQuotationStockAvailable } from '../assertQuotationStockAvailable';

export class SubmitQuotationUseCase {
  constructor(
    private writeTx: IQuotationWriteTransaction,
    private userRepo: IUserRepository,
    private lineItemRepo: IQuotationLineItemRepository,
    private stockLevelRepo: IStockLevelRepository,
    private scopes: RecordScopeResolver,
    private emailDispatcher?: IPostCommitEmailDispatcher,
    private delivery?: IQuotationDeliveryService
  ) {}

  async execute(input: {
    tenantId: string;
    quotationId: string;
    actingUserId: string;
    access: AccessContext;
    requiresQuotationApproval: boolean;
  }) {
    const scope = await this.scopes.resolve(input.access, 'quotations.manage');
    const result = await runWithPostCommitEmail(this.writeTx, this.emailDispatcher, async (repos, notify) => {
      const quotation = await repos.quotationRepo.findById(input.tenantId, input.quotationId);
      if (!quotation) {
        throw new Error('Quotation not found');
      }

      reachableQuotation(quotation, scope);

      const fromStatus = quotation.status;
      quotation.submit({ requiresApproval: input.requiresQuotationApproval });

      /*
       * Only on the branch that actually reaches the client. A quotation
       * held for approval is not sent yet — ApproveQuotationUseCase runs this
       * same check on its own way to SENT, since stock can move in the
       * meantime. Checked (and can throw) before `issueShareToken`, so a
       * quotation refused here never gets a customer-facing link at all.
       */
      if (quotation.status === QuotationStatus.Sent) {
        await assertQuotationStockAvailable(input.tenantId, input.quotationId, this.lineItemRepo, this.stockLevelRepo);
      }

      // Mints the customer link, but only on the branch that actually reaches
      // SENT — the entity refuses on any other status, so this is safe to call
      // unconditionally and there is no second `if` to keep in sync with
      // `submit`'s own branching.
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
       * Only PENDING_APPROVAL produces a notification. `submit` resolves to
       * either that or SENT depending on the tenant's approval setting, and a
       * quotation that went straight out needs nobody's attention — notifying
       * on both would make the bell meaningless for tenants who do not use
       * approvals at all.
       *
       * Inside the transaction on purpose: this notification is the only thing
       * telling an owner there is work waiting, so it must not survive a
       * rolled-back submit, nor be lost when the submit succeeds.
       */
      if (quotation.status === 'PENDING_APPROVAL') {
        const notifications = new NotificationService(repos.notificationRepo, this.userRepo);
        notify(
          await notifications.emit({
            tenantId: input.tenantId,
            toRole: UserRole.BUSINESS_OWNER,
            type: 'QUOTATION_SUBMITTED_FOR_APPROVAL',
            // Snapshot: the reference as shown on the quotation page.
            params: { reference: quotationReference(quotation.id) },
            actorUserId: input.actingUserId,
            entityType: 'QUOTATION',
            entityId: quotation.id,
          })
        );
      }

      return { quotation };
    });

    /*
     * Deliver to the customer, but only on the branch that actually sent.
     *
     * With approval enabled, `submit` stops at PENDING_APPROVAL and nothing
     * should leave the building — that is the entire purpose of the approval
     * step. `ApproveQuotationUseCase` delivers for that path instead.
     *
     * After the transaction, and not awaited-into-it: an SMTP round trip has no
     * business holding a database transaction open, and the quotation is
     * legitimately sent whether or not the mail lands.
     */
    if (result.quotation.status === QuotationStatus.Sent) {
      await this.delivery?.deliverToClient(result.quotation.shareToken);
    }

    return result;
  }
}
