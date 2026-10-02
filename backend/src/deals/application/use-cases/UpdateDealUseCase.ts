import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { DealEdit } from '../../domain/Deal';
import { EDIT_DEALS } from '../dealAccess';
import { DealDetail } from '../dealViews';
import { dealInScope } from '../dealRules';
import { IDealWriteTransaction } from '../ports/IDealWriteTransaction';
import { GetDealUseCase } from './GetDealUseCase';

/** Edits a deal's type, title, expected close date and notes (FR-DEAL-01). Plain edits are not audited. */
export class UpdateDealUseCase {
  constructor(
    private readonly writeTx: IDealWriteTransaction,
    private readonly scopes: RecordScopeResolver,
    private readonly getDeal: GetDealUseCase
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; id: string; edit: DealEdit }): Promise<DealDetail> {
    const { access, tenantId, id } = input;
    access.ensure(EDIT_DEALS);
    await this.writeTx.run(async ({ deals }) => {
      const deal = await dealInScope(deals, this.scopes, access, EDIT_DEALS, tenantId, id);
      deal.edit(input.edit, new Date());
      await deals.update(deal);
    });
    return this.getDeal.execute({ access, tenantId, id });
  }
}
