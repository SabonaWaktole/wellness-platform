import { Prisma } from '@prisma/client';
import { Money } from '../../../pricing/domain/Money';
import { Percent } from '../../../pricing/domain/Percent';
import { PriceOnRequestReason } from '../../../pricing/domain/PriceCalculator';
import { Offer, OfferAmounts, OfferLanguage } from '../../domain/Offer';
import { QuotationStatus } from '../../domain/Quotation';
import { OfferView } from '../../application/offers/offerViews';

const SERVICES = { orderBy: [{ order: 'asc' }, { id: 'asc' }] } satisfies Prisma.Quotation$servicesArgs;

export const OFFER_INCLUDE = {
  services: SERVICES,
  createdBy: { select: { firstName: true, lastName: true, email: true } },
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

const json = (value: Prisma.JsonValue | null) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    employeesPriced: row.employeesPriced ?? 0,
    packageId: row.packageId ?? '',
    frequencyId: row.frequencyId,
    zoneId: row.zoneId,
    pricingInputs: json(row.pricingInputs) ?? {},
    ruleSnapshot: json(row.ruleSnapshot) ?? {},
    amounts: amountsOf(row),
    services: services(row),
    note: row.note,
  });
}

export function toOfferView(row: OfferRow): OfferView {
  const snapshot = json(row.ruleSnapshot);
  const { createdBy } = row;
  return {
    id: row.id,
    dealId: row.dealId!,
    clientId: row.clientId,
    status: row.status,
    language: row.language as OfferLanguage,
    note: row.note,
    createdByUserId: row.createdByUserId,
    createdByName: [createdBy.firstName, createdBy.lastName].filter(Boolean).join(' ') || createdBy.email,
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
    ...Object.fromEntries(AMOUNT_COLUMNS.map((column) => [column, text(row[column])])),
  } as OfferView;
}
