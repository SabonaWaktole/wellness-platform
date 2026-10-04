import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits } from '../../../access/domain/RecordScope';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { AuditActor } from '../../../audit/domain/AuditEntry';
import { Deal } from '../../../deals/domain/Deal';
import { Offer } from '../../domain/Offer';
import { OfferNotEditableError, OfferNotFoundError } from '../../domain/offerErrors';
import { quotationReference } from '../../domain/quotationReference';
import { EDIT_OFFERS } from './offerAccess';
import { OfferWriteRepos } from './ports/IOfferWriteTransaction';

/**
 * The offer and its deal, on the transaction, if `access` may change the
 * deal's offers (`offers.edit` in scope on the deal's salesperson). Outside
 * the scope, or on a deleted deal, the offer is "not found".
 */
export async function offerInScope(
  repos: OfferWriteRepos,
  scopes: RecordScopeResolver,
  access: AccessContext,
  tenantId: string,
  offerId: string
): Promise<{ offer: Offer; deal: Deal }> {
  const offer = await repos.offers.find(tenantId, offerId);
  const deal = offer ? await repos.deals.find(tenantId, offer.dealId) : null;
  if (!offer || !deal || !admits(await scopes.resolve(access, EDIT_OFFERS), deal.ownerUserId)) {
    throw new OfferNotFoundError();
  }
  return { offer, deal };
}

/** A won or lost deal's offers no longer change. */
export function ensureDealOpen(deal: Deal): void {
  if (!deal.isOpen) throw new OfferNotEditableError("A closed deal's offers no longer change.");
}

export function actorOf(access: AccessContext): AuditActor {
  return { userId: access.userId, userRole: access.auditRole };
}

/**
 * One status change, written twice in the same transaction (FR-OFR-15,
 * FR-AUD-09): a history row on the offer and an `Offer` audit entry with
 * its number, version and final prices.
 */
export async function recordOfferChange(
  repos: OfferWriteRepos,
  offer: Offer,
  from: string,
  actor: AuditActor,
  note: string | null = null
): Promise<void> {
  const props = offer.toProps();
  await repos.offers.recordStatusChange({
    tenantId: props.tenantId,
    offerId: props.id,
    fromStatus: from,
    toStatus: props.status,
    userId: actor.userId,
    note,
  });
  const amounts = props.amounts;
  const changes = [
    { field: 'status', old: from, new: props.status },
    { field: 'number', old: props.number, new: props.number },
    { field: 'version', old: props.version, new: props.version },
    { field: 'listPrice', old: amounts?.listPrice.toString() ?? null, new: amounts?.listPrice.toString() ?? null },
    { field: 'discountPercent', old: amounts?.discountPercent.toString() ?? null, new: amounts?.discountPercent.toString() ?? null },
    { field: 'netMonthlyPrice', old: amounts?.netMonthlyPrice.toString() ?? null, new: amounts?.netMonthlyPrice.toString() ?? null },
  ];
  if (props.validUntil) changes.push({ field: 'validUntil', old: null, new: props.validUntil });
  if (note) changes.push({ field: 'note', old: null, new: note });
  await repos.auditTrail.record({
    tenantId: props.tenantId,
    userId: actor.userId,
    userRole: actor.userRole,
    action: AuditAction.StatusChange,
    entityType: 'Offer',
    entityId: props.id,
    entityLabel: await offerAuditLabel(repos, offer),
    changes,
  });
}

/** "OF-2026-0001 v2 — Kafe Blloku": the offer's reference and its company. */
export async function offerAuditLabel(repos: OfferWriteRepos, offer: Offer): Promise<string> {
  const props = offer.toProps();
  const company = await repos.deals.companyName(props.tenantId, props.clientId);
  const reference = quotationReference(props);
  return company ? `${reference} — ${company}` : reference;
}
