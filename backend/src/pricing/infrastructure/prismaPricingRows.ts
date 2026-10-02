import { Prisma } from '@prisma/client';
import { FrequencyPricingType } from '../domain/DefaultPricing';
import { EmployeeBand, PriceZone, Service, ServicePackage, VisitFrequency } from '../domain/PricingLists';
import { OfferSettings } from '../domain/OfferSettings';
import { OFFER_TEXT_FIELDS } from '../domain/DefaultOfferSettings';
import type { RichTextDoc } from '../../shared/domain/richText';

/**
 * The one place Prisma's Decimal meets the domain: amounts and percentages
 * leave the database as two-decimal strings and go back in as strings, so a
 * float never touches them (NFR-ACC-02).
 */
export const decimalText = (value: Prisma.Decimal): string => value.toFixed(2);

/**
 * A stored rich text (TipTap JSON, already sanitised) as Prisma writes it:
 * `DbNull` for none, so the column holds SQL NULL rather than JSON `null`.
 */
export const richTextData = (doc: RichTextDoc | null): Prisma.InputJsonObject | typeof Prisma.DbNull =>
  doc === null ? Prisma.DbNull : (doc as unknown as Prisma.InputJsonObject);

/** A rich-text column as read back; the sanitiser decided its shape on the way in. */
export const richTextFromRow = (value: Prisma.JsonValue | null): RichTextDoc | null =>
  value === null ? null : (value as unknown as RichTextDoc);

type BandRow = Prisma.EmployeeBandGetPayload<object>;
type FrequencyRow = Prisma.VisitFrequencyGetPayload<object>;
export const zoneInclude = { cities: { select: { cityId: true } } } as const;
type ZoneRow = Prisma.PriceZoneGetPayload<{ include: typeof zoneInclude }>;
type ServiceRow = Prisma.ServiceGetPayload<object>;
export const packageInclude = { services: { select: { serviceId: true }, orderBy: { order: 'asc' } } } as const;
type PackageRow = Prisma.ServicePackageGetPayload<{ include: typeof packageInclude }>;
type SettingsRow = Prisma.PricingSettingsGetPayload<object>;

export const bandFromRow = (row: BandRow): EmployeeBand => ({
  id: row.id,
  minEmployees: row.minEmployees,
  maxEmployees: row.maxEmployees,
  baseFee: decimalText(row.baseFee),
  perEmployeeFee: decimalText(row.perEmployeeFee),
  active: row.active,
  order: row.minEmployees,
});

export const frequencyFromRow = (row: FrequencyRow): VisitFrequency => ({
  id: row.id,
  nameSq: row.nameSq,
  nameEn: row.nameEn,
  visitsPerYear: row.visitsPerYear,
  pricingType: row.pricingType as FrequencyPricingType,
  frequencyValue: decimalText(row.value),
  order: row.order,
  active: row.active,
});

export const zoneFromRow = (row: ZoneRow): PriceZone => ({
  id: row.id,
  nameSq: row.nameSq,
  nameEn: row.nameEn,
  surchargePercent: decimalText(row.surchargePercent),
  cityIds: row.cities.map((city) => city.cityId).sort(),
  order: row.order,
  active: row.active,
});

export const bandData = (band: EmployeeBand) => ({
  minEmployees: band.minEmployees,
  maxEmployees: band.maxEmployees,
  baseFee: band.baseFee,
  perEmployeeFee: band.perEmployeeFee,
  active: band.active,
});

export const frequencyData = (frequency: VisitFrequency) => ({
  nameSq: frequency.nameSq,
  nameEn: frequency.nameEn,
  visitsPerYear: frequency.visitsPerYear,
  pricingType: frequency.pricingType,
  value: frequency.frequencyValue,
  order: frequency.order,
  active: frequency.active,
});

export const zoneData = (zone: PriceZone) => ({
  nameSq: zone.nameSq,
  nameEn: zone.nameEn,
  surchargePercent: zone.surchargePercent,
  order: zone.order,
  active: zone.active,
});

export const serviceFromRow = (row: ServiceRow): Service => ({
  id: row.id,
  nameSq: row.nameSq,
  nameEn: row.nameEn,
  descriptionSq: row.descriptionSq,
  descriptionEn: row.descriptionEn,
  order: row.order,
  active: row.active,
});

export const packageFromRow = (row: PackageRow): ServicePackage => ({
  id: row.id,
  nameSq: row.nameSq,
  nameEn: row.nameEn,
  descriptionSq: row.descriptionSq,
  descriptionEn: row.descriptionEn,
  serviceIds: row.services.map((link) => link.serviceId),
  isDefault: row.isDefault,
  order: row.order,
  active: row.active,
});

export const serviceData = (service: Service) => ({
  nameSq: service.nameSq,
  nameEn: service.nameEn,
  descriptionSq: service.descriptionSq,
  descriptionEn: service.descriptionEn,
  order: service.order,
  active: service.active,
});

/** A package's own fields; its services and default flag are written by their own methods. */
export const packageData = (pkg: ServicePackage) => ({
  nameSq: pkg.nameSq,
  nameEn: pkg.nameEn,
  descriptionSq: pkg.descriptionSq,
  descriptionEn: pkg.descriptionEn,
  order: pkg.order,
  active: pkg.active,
});

export const offerSettingsFromRow = (row: SettingsRow): OfferSettings => ({
  offerValidityDays: row.offerValidityDays,
  contractMonthsDefault: row.contractMonthsDefault,
  offerNumberPrefix: row.offerNumberPrefix,
  companyName: row.companyName,
  nipt: row.nipt,
  address: row.address,
  phone: row.phone,
  email: row.email,
  website: row.website,
  bankDetails: row.bankDetails,
  introSq: richTextFromRow(row.introSq),
  introEn: richTextFromRow(row.introEn),
  termsSq: richTextFromRow(row.termsSq),
  termsEn: richTextFromRow(row.termsEn),
  closingSq: richTextFromRow(row.closingSq),
  closingEn: richTextFromRow(row.closingEn),
});

/** Offer settings changes as Prisma writes them: the texts as JSON or SQL NULL. */
export function offerSettingsData(changes: Partial<OfferSettings>): Prisma.PricingSettingsUncheckedUpdateInput {
  const data: Record<string, unknown> = { ...changes };
  for (const field of OFFER_TEXT_FIELDS) {
    if (field in changes) data[field] = richTextData(changes[field] ?? null);
  }
  return data as Prisma.PricingSettingsUncheckedUpdateInput;
}
