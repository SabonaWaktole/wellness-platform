import { Prisma } from '@prisma/client';
import { FrequencyPricingType } from '../domain/DefaultPricing';
import { EmployeeBand, PriceZone, VisitFrequency } from '../domain/PricingLists';

/**
 * The one place Prisma's Decimal meets the domain: amounts and percentages
 * leave the database as two-decimal strings and go back in as strings, so a
 * float never touches them (NFR-ACC-02).
 */
export const decimalText = (value: Prisma.Decimal): string => value.toFixed(2);

type BandRow = Prisma.EmployeeBandGetPayload<object>;
type FrequencyRow = Prisma.VisitFrequencyGetPayload<object>;
export const zoneInclude = { cities: { select: { cityId: true } } } as const;
type ZoneRow = Prisma.PriceZoneGetPayload<{ include: typeof zoneInclude }>;

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
