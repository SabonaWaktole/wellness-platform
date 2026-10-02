import { AccessContext } from '../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../access/application/RecordScopeResolver';
import { VIEW_DEALS } from '../../deals/application/dealAccess';
import { dealInScope } from '../../deals/application/dealRules';
import { IDealWrites } from '../../deals/application/ports/IDealWriteTransaction';
import { Deal } from '../../deals/domain/Deal';
import { DealNotFoundError } from '../../deals/domain/errors';
import { ILookupStore } from '../../lookups/application/ports/ILookupStore';
import { LookupList } from '../../lookups/domain/LookupList';
import { ActivityDetails, Interaction } from '../domain/entities/Interaction';
import { InvalidActivityError } from '../domain/errors';
import { IContactPersonRepository } from '../domain/repositories/IContactPersonRepository';

export interface ActivityReferenceReaders {
  contacts: IContactPersonRepository;
  lookups: ILookupStore;
  scopes: RecordScopeResolver;
}

/**
 * Checks what an activity points at (FR-ACT-01, 02): the contact is one of
 * this company's, the result is an active activity result, and the deal is
 * an open deal of this company that the caller can see. On an edit only what
 * changed is checked, so an activity keeps a deal that has since been won.
 * Returns the deal when one was checked, for the automatic move (FR-DEAL-08).
 */
export async function checkActivityReferences(
  readers: ActivityReferenceReaders,
  deals: IDealWrites,
  input: { access: AccessContext; tenantId: string; clientId: string; details: ActivityDetails; previous?: Interaction }
): Promise<Deal | null> {
  const { access, tenantId, clientId, details, previous } = input;

  if (details.contactPersonId && details.contactPersonId !== previous?.contactPersonId) {
    const contacts = await readers.contacts.listByClient(tenantId, clientId);
    if (!contacts.some((contact) => contact.id === details.contactPersonId)) {
      throw new InvalidActivityError('contactPersonId', 'Choose a contact person of this company.');
    }
  }

  if (details.resultId && details.resultId !== previous?.resultId) {
    const result = await readers.lookups.findById(tenantId, LookupList.ActivityResults, details.resultId);
    if (!result || !result.active) {
      throw new InvalidActivityError('resultId', 'Choose an active result.');
    }
  }

  if (!details.dealId || details.dealId === previous?.dealId) return null;
  let deal: Deal;
  try {
    deal = await dealInScope(deals, readers.scopes, access, VIEW_DEALS, tenantId, details.dealId);
  } catch (error) {
    if (error instanceof DealNotFoundError) throw new InvalidActivityError('dealId', 'Choose an open deal of this company.');
    throw error;
  }
  if (deal.clientId !== clientId || !deal.isOpen) {
    throw new InvalidActivityError('dealId', 'Choose an open deal of this company.');
  }
  return deal;
}
