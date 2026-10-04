import { AuditAction } from '../../../audit/domain/AuditAction';
import { AuditChange } from '../../../audit/domain/AuditChange';
import { AccessContext } from '../../../access/domain/AccessContext';
import { dealLabel } from '../../domain/dealLabel';
import { Deal } from '../../domain/Deal';
import { InvalidDealError } from '../../domain/errors';
import { OfferWriteRepos } from '../../../quotations/application/offers/ports/IOfferWriteTransaction';

/** The closing date of a win or a loss: today unless the salesperson chose, never in the future (FR-DEAL-14). */
export function closingDateOf(input: Date | undefined, now: Date): Date {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const date = input ?? today;
  if (date.getTime() > today.getTime() + 24 * 60 * 60 * 1000) {
    throw new InvalidDealError('closingDate', 'The closing date cannot be in the future.');
  }
  return date;
}

/** One audit entry on the deal, with its label (FR-AUD-09). */
export async function auditDeal(
  repos: OfferWriteRepos,
  access: AccessContext,
  deal: Deal,
  action: AuditAction,
  changes: AuditChange[]
): Promise<void> {
  const company = await repos.deals.companyName(deal.tenantId, deal.clientId);
  await repos.auditTrail.record({
    tenantId: deal.tenantId,
    userId: access.userId,
    userRole: access.auditRole,
    action,
    entityType: 'Deal',
    entityId: deal.id,
    entityLabel: dealLabel(deal.title, company, deal.type),
    changes,
  });
}
