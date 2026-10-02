import { AccessContext } from '../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../access/application/RecordScopeResolver';
import { admits } from '../../access/domain/RecordScope';
import { Deal } from '../domain/Deal';
import { DealNotFoundError, InvalidDealError } from '../domain/errors';
import { IDealStore } from './ports/IDealStore';
import { IDealWrites } from './ports/IDealWriteTransaction';

/**
 * The deal, if `access` reaches it through `key` (FR-DEAL-04). A deal outside
 * the scope is "not found", never "forbidden", so a link to someone else's
 * deal does not confirm it exists.
 */
export async function dealInScope(
  deals: IDealWrites,
  scopes: RecordScopeResolver,
  access: AccessContext,
  key: string,
  tenantId: string,
  id: string
): Promise<Deal> {
  const deal = await deals.find(tenantId, id);
  if (!deal || !admits(await scopes.resolve(access, key), deal.ownerUserId)) {
    throw new DealNotFoundError();
  }
  return deal;
}

/**
 * A deal's salesperson must be an active user of the workspace that `key`
 * reaches for the person choosing them: a Sales Manager hands deals to the
 * sales team or keeps them, never to Reception or to someone who has left.
 */
export async function ensureEligibleOwner(
  store: IDealStore,
  scopes: RecordScopeResolver,
  access: AccessContext,
  key: string,
  tenantId: string,
  ownerUserId: string
): Promise<void> {
  if (!(await store.isActiveUser(tenantId, ownerUserId))) {
    throw new InvalidDealError('ownerUserId', 'Choose an active user of this workspace.');
  }
  if (!admits(await scopes.resolve(access, key), ownerUserId)) {
    throw new InvalidDealError('ownerUserId', 'You cannot hand a deal to that user.');
  }
}
