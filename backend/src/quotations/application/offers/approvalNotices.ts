import { NotificationParams } from '../../../notifications/domain/NotificationType';

/**
 * What an approval request's notification carries (FR-DSC-05, FR-PRC-09):
 * the company, the salesperson, the list price, the requested % (or the
 * requested manual price) and the reason, plus the ids that open the request.
 * Used for the request itself and for its reminder (FR-DSC-12), so both read
 * the same. Values that do not apply to the request's kind are left out.
 */
export function approvalRequestParams(input: {
  kind: 'DISCOUNT' | 'MANUAL_PRICE';
  reference: string;
  clientName: string;
  salespersonName: string;
  reason: string;
  requestedPercent: string | null;
  listPrice: string | null;
  requestedMonthlyPrice: string | null;
  offerId: string;
  dealId: string;
}): NotificationParams {
  const params: NotificationParams = {
    kind: input.kind,
    reference: input.reference,
    clientName: input.clientName,
    salespersonName: input.salespersonName,
    reason: input.reason,
    offerId: input.offerId,
    dealId: input.dealId,
  };
  if (input.requestedPercent !== null) params.requestedPercent = input.requestedPercent;
  if (input.listPrice !== null) params.listPrice = input.listPrice;
  if (input.requestedMonthlyPrice !== null) params.requestedMonthlyPrice = input.requestedMonthlyPrice;
  return params;
}

/** A person as notifications and lists name them: their name, else their email. */
export const displayName = (person: { firstName: string | null; lastName: string | null; email: string } | null): string =>
  person ? [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email : '';
