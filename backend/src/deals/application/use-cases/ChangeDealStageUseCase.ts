import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { DealStage } from '../../domain/DealStage';
import { EDIT_DEALS } from '../dealAccess';
import { DealDetail } from '../dealViews';
import { dealInScope } from '../dealRules';
import { IDealWriteTransaction } from '../ports/IDealWriteTransaction';
import { GetDealUseCase } from './GetDealUseCase';

/**
 * The salesperson moves a deal to another open stage, from the board or the
 * card menu (FR-DEAL-07, 10, 13). The deal and its stage-history row are
 * saved together (FR-DEAL-09). A stage change is history, not an audit entry.
 */
export class ChangeDealStageUseCase {
  constructor(
    private readonly writeTx: IDealWriteTransaction,
    private readonly scopes: RecordScopeResolver,
    private readonly getDeal: GetDealUseCase
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; id: string; stage: DealStage }): Promise<DealDetail> {
    const { access, tenantId, id } = input;
    access.ensure(EDIT_DEALS);
    await this.writeTx.run(async ({ deals }) => {
      const deal = await dealInScope(deals, this.scopes, access, EDIT_DEALS, tenantId, id);
      const change = deal.moveTo(input.stage, access.userId, new Date(), randomUUID);
      if (!change) return;
      await deals.update(deal);
      await deals.recordChange(tenantId, change);
    });
    return this.getDeal.execute({ access, tenantId, id });
  }
}
