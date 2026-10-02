import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits } from '../../../access/domain/RecordScope';
import { Deal } from '../../domain/Deal';
import { DealType } from '../../domain/DealType';
import { InvalidDealError } from '../../domain/errors';
import { EDIT_DEALS, REASSIGN_DEALS, VIEW_COMPANIES } from '../dealAccess';
import { DealDetail } from '../dealViews';
import { ensureEligibleOwner } from '../dealRules';
import { IDealStore } from '../ports/IDealStore';
import { IDealWriteTransaction } from '../ports/IDealWriteTransaction';
import { GetDealUseCase } from './GetDealUseCase';

export interface CreateDealInput {
  access: AccessContext;
  tenantId: string;
  clientId: string;
  type: DealType;
  title?: string | null;
  ownerUserId?: string | null;
  expectedCloseDate?: Date | null;
  notes?: string | null;
}

/**
 * A new deal on a company the creator can see (FR-DEAL-01), in New Lead,
 * with its first stage-history row in the same transaction (FR-DEAL-09).
 *
 * The salesperson defaults to the company's, or to the creator when the
 * company has none (or theirs has left). Naming anyone else takes
 * `companies.reassign`, as it does for a company (FR-DEAL-05).
 */
export class CreateDealUseCase {
  constructor(
    private readonly store: IDealStore,
    private readonly writeTx: IDealWriteTransaction,
    private readonly scopes: RecordScopeResolver,
    private readonly getDeal: GetDealUseCase
  ) {}

  async execute(input: CreateDealInput): Promise<DealDetail> {
    const { access, tenantId } = input;
    access.ensure(EDIT_DEALS);

    const company = await this.store.company(tenantId, input.clientId);
    if (!company || !admits(await this.scopes.resolve(access, VIEW_COMPANIES), company.assignedUserId)) {
      throw new InvalidDealError('clientId', 'Choose a company you can see.');
    }

    const defaultOwner = company.assignedUserId && company.assigneeActive ? company.assignedUserId : access.userId;
    const ownerUserId = input.ownerUserId ?? defaultOwner;
    if (ownerUserId !== defaultOwner) access.ensure(REASSIGN_DEALS);
    await ensureEligibleOwner(this.store, this.scopes, access, EDIT_DEALS, tenantId, ownerUserId);

    const { deal, change } = Deal.open({
      id: randomUUID(),
      tenantId,
      clientId: company.id,
      ownerUserId,
      createdByUserId: access.userId,
      type: input.type,
      title: input.title ?? null,
      expectedCloseDate: input.expectedCloseDate ?? null,
      notes: input.notes ?? null,
      now: new Date(),
      newId: randomUUID,
    });
    await this.writeTx.run(async ({ deals }) => {
      await deals.insert(deal);
      await deals.recordChange(tenantId, change);
    });

    return this.getDeal.execute({ access, tenantId, id: deal.id });
  }
}
