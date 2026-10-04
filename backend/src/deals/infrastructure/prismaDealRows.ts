import { Prisma } from '@prisma/client';
import { Deal } from '../domain/Deal';
import { DealStage } from '../domain/DealStage';
import { DealType } from '../domain/DealType';
import { calendarDate, DealSummary } from '../application/dealViews';

const personName = { select: { firstName: true, lastName: true, email: true } } as const;

/** What a summary needs from a Deal row: its company's name and its salesperson's name. */
export const DEAL_SUMMARY_INCLUDE = {
  client: { select: { name: true } },
  owner: personName,
} satisfies Prisma.DealInclude;

type SummaryRow = Prisma.DealGetPayload<{ include: typeof DEAL_SUMMARY_INCLUDE }>;
type DealRow = Prisma.DealGetPayload<object>;

/** "First Last", or the email for a user with no name. */
export function displayName(user: { firstName: string | null; lastName: string | null; email: string }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

export function toSummary(row: SummaryRow): DealSummary {
  return {
    id: row.id,
    clientId: row.clientId,
    companyName: row.client.name ?? '',
    type: row.type as DealType,
    title: row.title,
    stage: row.stageKey as DealStage,
    ownerUserId: row.ownerUserId,
    ownerName: displayName(row.owner),
    expectedCloseDate: calendarDate(row.expectedCloseDate),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    // The deal's offer value, copied onto the deal when the offer is saved (Slice 8).
    netMonthlyPrice: row.offerNetMonthlyPrice?.toFixed(2) ?? null,
    annualValue: row.offerAnnualValue?.toFixed(2) ?? null,
    // From the follow-ups and activities (Slice 11), filled in by PrismaDealStore.
    nextFollowUpAt: null,
    lastActivityAt: row.createdAt.toISOString(),
    hasOverdueFollowUp: false,
    isStale: false,
  };
}

export function toDeal(row: DealRow): Deal {
  return Deal.rebuild({
    id: row.id,
    tenantId: row.tenantId,
    clientId: row.clientId,
    ownerUserId: row.ownerUserId,
    type: row.type as DealType,
    title: row.title,
    stage: row.stageKey as DealStage,
    expectedCloseDate: row.expectedCloseDate,
    notes: row.notes,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    closedAt: row.closedAt,
    deletedAt: row.deletedAt,
    wonAt: row.wonAt,
    lostAt: row.lostAt,
    lostReasonId: row.lostReasonId,
    lostNote: row.lostNote,
    agreedMonthlyPrice: row.agreedMonthlyPrice?.toFixed(2) ?? null,
    agreedAnnualValue: row.agreedAnnualValue?.toFixed(2) ?? null,
    packageId: row.packageId,
    wonQuotationId: row.wonQuotationId,
  });
}

/** The columns a domain deal writes, including the result of a won or lost deal (Slice 13). */
export function dealColumns(deal: Deal) {
  const props = deal.toProps();
  return {
    ownerUserId: props.ownerUserId,
    type: props.type,
    title: props.title,
    stageKey: props.stage,
    expectedCloseDate: props.expectedCloseDate,
    notes: props.notes,
    updatedAt: props.updatedAt,
    closedAt: props.closedAt,
    deletedAt: props.deletedAt,
    wonAt: props.wonAt,
    lostAt: props.lostAt,
    lostReasonId: props.lostReasonId,
    lostNote: props.lostNote,
    agreedMonthlyPrice: props.agreedMonthlyPrice,
    agreedAnnualValue: props.agreedAnnualValue,
    packageId: props.packageId,
    wonQuotationId: props.wonQuotationId,
  };
}
