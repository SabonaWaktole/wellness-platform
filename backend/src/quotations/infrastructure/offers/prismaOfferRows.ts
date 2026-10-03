import { Prisma } from '@prisma/client';
import { Money } from '../../../pricing/domain/Money';
import { Percent } from '../../../pricing/domain/Percent';
import { PriceOnRequestReason } from '../../../pricing/domain/PriceCalculator';
import { isDealStage, isOpenStage } from '../../../deals/domain/DealStage';
import { Offer, OfferAmounts, OfferLanguage, OfferManualPrice, OfferProps } from '../../domain/Offer';
import { QuotationStatus } from '../../domain/Quotation';
import { quotationReference } from '../../domain/quotationReference';
import { OfferView } from '../../application/offers/offerViews';

const SERVICES = { orderBy: [{ order: 'asc' }, { id: 'asc' }] } satisfies Prisma.Quotation$servicesArgs;

const PERSON = { select: { firstName: true, lastName: true, email: true } } as const;

export const OFFER_INCLUDE = {
  services: SERVICES,
  createdBy: PERSON,
  client: { select: { name: true } },
  deal: { select: { title: true, ownerUserId: true, stageKey: true, deletedAt: true, owner: PERSON } },
  // The latest status change, for its note (FR-OFR-12).
  statusHistory: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { note: true } },
  // The pending approval, for the inline approve/reject/withdraw steps (FR-DSC-03), and the
  // latest approved one, so the pricing screen knows what it still covers (FR-DSC-08). A
  // pending request is always the newest, so the newest two rows hold both.
  discountApprovals: {
    where: { status: { in: ['PENDING', 'APPROVED'] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 2,
    include: { requestedBy: PERSON },
  },
} satisfies Prisma.QuotationInclude;

type OfferRow = Prisma.QuotationGetPayload<{ include: typeof OFFER_INCLUDE }>;
type Amount = Prisma.Decimal | null;

const AMOUNT_COLUMNS = [
  'baseFee',
  'riskFee',
  'visitFee',
  'locationFee',
  'listPrice',
  'discountPercent',
  'discountAmount',
  'netMonthlyPrice',
  'pricePerEmployee',
  'annualValue',
] as const;

const text = (value: Amount): string | null => (value === null ? null : value.toFixed(2));

/** The amount columns a domain offer writes, as Decimal strings (NFR-ACC-02). */
export function amountColumns(amounts: OfferAmounts | null): Record<(typeof AMOUNT_COLUMNS)[number], string | null> {
  return Object.fromEntries(AMOUNT_COLUMNS.map((column) => [column, amounts ? amounts[column].toString() : null])) as Record<
    (typeof AMOUNT_COLUMNS)[number],
    string | null
  >;
}

function amountsOf(row: OfferRow): OfferAmounts | null {
  if (row.listPrice === null) return null;
  const money = (value: Amount) => Money.of(value!.toFixed(2));
  return {
    baseFee: money(row.baseFee),
    riskFee: money(row.riskFee),
    visitFee: money(row.visitFee),
    locationFee: money(row.locationFee),
    listPrice: money(row.listPrice),
    discountPercent: Percent.of(row.discountPercent!.toFixed(2)),
    discountAmount: money(row.discountAmount),
    netMonthlyPrice: money(row.netMonthlyPrice),
    pricePerEmployee: money(row.pricePerEmployee),
    annualValue: money(row.annualValue),
  };
}

/** FR-PRC-09: the manual price columns a domain offer writes. */
export function manualPriceColumns(manualPrice: OfferManualPrice | null) {
  return {
    manualMonthlyPrice: manualPrice?.monthlyPrice.toString() ?? null,
    manualPriceReason: manualPrice?.reason ?? null,
  };
}

function manualPriceOf(row: OfferRow): OfferManualPrice | null {
  if (row.manualMonthlyPrice === null) return null;
  return { monthlyPrice: Money.of(row.manualMonthlyPrice.toFixed(2)), reason: row.manualPriceReason ?? '' };
}

const json = (value: Prisma.JsonValue | null) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

const personName = (person: { firstName: string | null; lastName: string | null; email: string }) =>
  [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email;

/** A `@db.Date` column as YYYY-MM-DD; Prisma reads it as UTC midnight. */
const day = (value: Date | null): string | null => (value ? value.toISOString().slice(0, 10) : null);

/** YYYY-MM-DD as the Date a `@db.Date` column stores. */
export const dateColumn = (value: string | null): Date | null => (value ? new Date(`${value}T00:00:00.000Z`) : null);

/** The columns a status change writes (FR-OFR-09..13). */
export function statusColumns(props: OfferProps) {
  return {
    status: props.status,
    supersededAt: props.supersededAt,
    readyAt: props.readyAt,
    sentAt: props.sentAt,
    validUntil: dateColumn(props.validUntil),
    respondedAt: props.respondedAt,
    renderSnapshot: props.renderSnapshot === null ? Prisma.DbNull : (props.renderSnapshot as Prisma.InputJsonObject),
    updatedAt: props.updatedAt,
  };
}

const services = (row: OfferRow) =>
  row.services.map((service) => ({
    serviceId: service.serviceId,
    nameSq: service.nameSq,
    nameEn: service.nameEn,
    descriptionSq: service.descriptionSq,
    descriptionEn: service.descriptionEn,
  }));

/** An offer row as the domain entity. Only rows with a deal are offers. */
export function toOffer(row: OfferRow): Offer {
  return Offer.rebuild({
    id: row.id,
    tenantId: row.tenantId,
    clientId: row.clientId,
    dealId: row.dealId!,
    createdByUserId: row.createdByUserId,
    status: row.status as QuotationStatus,
    language: row.language as OfferLanguage,
    number: row.number ?? '',
    version: row.version,
    previousVersionId: row.previousVersionId,
    supersededAt: row.supersededAt,
    readyAt: row.readyAt,
    sentAt: row.sentAt,
    validUntil: day(row.validUntil),
    respondedAt: row.respondedAt,
    renderSnapshot: json(row.renderSnapshot),
    contactPersonId: row.contactPersonId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    employeesPriced: row.employeesPriced ?? 0,
    packageId: row.packageId ?? '',
    frequencyId: row.frequencyId,
    zoneId: row.zoneId,
    pricingInputs: json(row.pricingInputs) ?? {},
    ruleSnapshot: json(row.ruleSnapshot) ?? {},
    amounts: amountsOf(row),
    manualPrice: manualPriceOf(row),
    services: services(row),
    note: row.note,
  });
}

export function toOfferView(row: OfferRow): OfferView {
  const snapshot = json(row.ruleSnapshot);
  const deal = row.deal!;
  const pending = row.discountApprovals.find((approval) => approval.status === 'PENDING') ?? null;
  const approved = row.discountApprovals.find((approval) => approval.status === 'APPROVED') ?? null;
  return {
    id: row.id,
    dealId: row.dealId!,
    clientId: row.clientId,
    status: row.status,
    number: row.number,
    version: row.version,
    reference: quotationReference(row),
    previousVersionId: row.previousVersionId,
    superseded: row.supersededAt !== null,
    readyAt: row.readyAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    validUntil: day(row.validUntil),
    respondedAt: row.respondedAt?.toISOString() ?? null,
    statusNote: row.statusHistory[0]?.note ?? null,
    contactPersonId: row.contactPersonId,
    companyName: row.client.name ?? '',
    dealTitle: deal.title,
    dealOwnerUserId: deal.ownerUserId,
    dealOwnerName: personName(deal.owner),
    dealOpen: deal.deletedAt === null && isDealStage(deal.stageKey) && isOpenStage(deal.stageKey),
    permittedActions: [],
    pendingApproval: pending
      ? {
          id: pending.id,
          requestedByUserId: pending.requestedByUserId,
          requestedByName: personName(pending.requestedBy),
          kind: pending.kind === 'MANUAL_PRICE' ? 'MANUAL_PRICE' : 'DISCOUNT',
          requestedPercent: text(pending.requestedPercent),
          listPriceAtRequest: text(pending.listPriceAtRequest),
          requestedMonthlyPrice: text(pending.requestedMonthlyPrice),
          reason: pending.reason,
          createdAt: pending.createdAt.toISOString(),
        }
      : null,
    approvedDiscount:
      approved && approved.kind !== 'MANUAL_PRICE' && approved.listPriceAtRequest && approved.approvedPercent
        ? { listPriceAtRequest: approved.listPriceAtRequest.toFixed(2), approvedPercent: approved.approvedPercent.toFixed(2) }
        : null,
    manualMonthlyPrice: text(row.manualMonthlyPrice),
    manualPriceReason: row.manualPriceReason,
    language: row.language as OfferLanguage,
    note: row.note,
    createdByUserId: row.createdByUserId,
    createdByName: personName(row.createdBy),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    employeesPriced: row.employeesPriced,
    packageId: row.packageId,
    frequencyId: row.frequencyId,
    zoneId: row.zoneId,
    pricingInputs: json(row.pricingInputs),
    ruleSnapshot: snapshot,
    priceOnRequest: (snapshot?.priceOnRequest as PriceOnRequestReason | undefined) ?? null,
    services: services(row),
    ...(Object.fromEntries(AMOUNT_COLUMNS.map((column) => [column, text(row[column])])) as Record<(typeof AMOUNT_COLUMNS)[number], string | null>),
  };
}
