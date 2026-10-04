import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { IDiscountApprovalStore, PendingApprovalView } from '../../../discounts/application/ports/IDiscountApprovalStore';
import { APPROVE_DISCOUNTS } from './offerAccess';

/**
 * The approver's pending list (FR-DSC-06): requests whose deal is inside the
 * viewer's `discounts.approve` scope, oldest first. A Sales Manager sees
 * their team's; the CEO sees every workspace's pending request.
 */
export class ListPendingApprovalsUseCase {
  constructor(
    private readonly store: IDiscountApprovalStore,
    private readonly scopes: RecordScopeResolver
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    page: number;
    pageSize: number;
  }): Promise<{ data: PendingApprovalView[]; total: number; page: number; pageSize: number }> {
    const { access, tenantId, page, pageSize } = input;
    access.ensure(APPROVE_DISCOUNTS);
    const scope = await this.scopes.resolve(access, APPROVE_DISCOUNTS);
    return this.store.listPending(tenantId, scope, page, pageSize);
  }
}
