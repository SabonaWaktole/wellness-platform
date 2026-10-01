import { findNameClash, lookupLabels } from '../../lookups/domain/LookupItem';
import { FrequencyPricingType } from './DefaultPricing';
import { BandsOverlapError, InvalidPricingValueError, PricingNameTakenError } from './errors';
import { parseFee, parsePercent, parseWholeNumber } from './PricingValues';

/**
 * The pricing lists the Administrator edits row by row (FR-PCF-01, 04, 05,
 * 06). The values are URL segments: `/pricing/bands`, `/pricing/frequencies`,
 * `/pricing/zones`, `/pricing/services`, `/pricing/packages`.
 */
export enum PricingList {
  Bands = 'bands',
  Frequencies = 'frequencies',
  Zones = 'zones',
  Services = 'services',
  Packages = 'packages',
}

export const PRICING_LISTS: readonly PricingList[] = Object.values(PricingList);

export function isPricingList(value: string): value is PricingList {
  return (PRICING_LISTS as readonly string[]).includes(value);
}

/** The audit entity type of each list (FR-AUD-09); registered in the Pricing filter group (FR-AUD-10). */
export const PRICING_AUDIT_ENTITY: Record<PricingList, string> = {
  [PricingList.Bands]: 'EmployeeBand',
  [PricingList.Frequencies]: 'VisitFrequency',
  [PricingList.Zones]: 'PriceZone',
  [PricingList.Services]: 'Service',
  [PricingList.Packages]: 'ServicePackage',
};

/** Amounts and percentages are strings with two decimals, as stored (NFR-ACC-02). */
export interface EmployeeBand {
  id: string;
  minEmployees: number;
  maxEmployees: number;
  baseFee: string;
  perEmployeeFee: string;
  active: boolean;
  /** Bands are shown by employee range; `order` only satisfies the shared list shape. */
  order: number;
}

export interface VisitFrequency {
  id: string;
  nameSq: string;
  nameEn: string | null;
  visitsPerYear: number | null;
  pricingType: FrequencyPricingType;
  /** A percentage of the base fee (PERCENT) or a fixed monthly amount (FIXED). */
  frequencyValue: string;
  order: number;
  active: boolean;
}

export interface PriceZone {
  id: string;
  nameSq: string;
  nameEn: string | null;
  surchargePercent: string;
  /** Predefined M1 cities; one city may be in several zones (FR-PRC-06). */
  cityIds: string[];
  order: number;
  active: boolean;
}

/** A service the offer describes (FR-PCF-06). It has no price (Q11). */
export interface Service {
  id: string;
  nameSq: string;
  nameEn: string | null;
  descriptionSq: string | null;
  descriptionEn: string | null;
  order: number;
  active: boolean;
}

/**
 * A named set of services (FR-PCF-06). Exactly one active package is the
 * default. Its services and the default flag have their own use cases, as a
 * zone's cities do.
 */
export interface ServicePackage {
  id: string;
  nameSq: string;
  nameEn: string | null;
  descriptionSq: string | null;
  descriptionEn: string | null;
  /** In the order the offer lists them. */
  serviceIds: string[];
  isDefault: boolean;
  order: number;
  active: boolean;
}

export interface PricingItemOf {
  [PricingList.Bands]: EmployeeBand;
  [PricingList.Frequencies]: VisitFrequency;
  [PricingList.Zones]: PriceZone;
  [PricingList.Services]: Service;
  [PricingList.Packages]: ServicePackage;
}

export type PricingItem = PricingItemOf[PricingList];

/**
 * What differs between the lists: how a request body becomes an item, which
 * siblings it may not clash with, and what the audit log shows. Pure, so the
 * rules hold for any caller.
 */
export interface PricingListRules<T extends PricingItem> {
  /** The item `values` describe, over `current` for an edit (omitted fields keep their value). */
  build(values: Record<string, unknown>, current: T | null): Omit<T, 'id' | 'order' | 'active'>;
  /** Throws if `item` may not stand next to `siblings` (the list, possibly including `item` itself). */
  validate(item: T, siblings: T[]): void;
  /** The fields the audit log records, as it should show them. */
  audited(item: T): Record<string, unknown>;
  label(item: T): string;
  /** Display order for a list read. */
  sort(items: T[]): T[];
}

const has = (values: Record<string, unknown>, field: string) => field in values && values[field] !== undefined;

const pick = <T>(values: Record<string, unknown>, field: string, current: T | undefined): unknown =>
  has(values, field) ? values[field] : current;

type NamedItem = VisitFrequency | PriceZone | Service | ServicePackage;

function checkNames<T extends NamedItem>(item: T, siblings: T[]) {
  if (findNameClash(siblings, { nameSq: item.nameSq, nameEn: item.nameEn }, item.id)) {
    throw new PricingNameTakenError();
  }
}

function labelsOf(values: Record<string, unknown>, current: { nameSq: string; nameEn: string | null } | null) {
  const nameSq = pick(values, 'nameSq', current?.nameSq);
  const nameEn = pick(values, 'nameEn', current?.nameEn ?? null);
  if (typeof nameSq !== 'string') {
    throw new InvalidPricingValueError('INVALID_PRICING_VALUE', 'nameSq', 'The Albanian name is required.');
  }
  try {
    return lookupLabels({ nameSq, nameEn: typeof nameEn === 'string' ? nameEn : null });
  } catch (error) {
    const field = (error as { field?: string }).field ?? 'nameSq';
    throw new InvalidPricingValueError('INVALID_PRICING_VALUE', field, (error as Error).message);
  }
}

const sortByOrder = <T extends NamedItem>(items: T[]) =>
  [...items].sort((a, b) => a.order - b.order || a.nameSq.localeCompare(b.nameSq, 'sq'));

/** The most employees a band may cover; far above any micro-business, it only keeps the number sane. */
export const MAX_EMPLOYEES = 100000;

export const bandRules: PricingListRules<EmployeeBand> = {
  build(values, current) {
    const minEmployees = parseWholeNumber(pick(values, 'minEmployees', current?.minEmployees), 'minEmployees', 1, MAX_EMPLOYEES);
    const maxEmployees = parseWholeNumber(pick(values, 'maxEmployees', current?.maxEmployees), 'maxEmployees', 1, MAX_EMPLOYEES);
    if (maxEmployees < minEmployees) {
      throw new InvalidPricingValueError(
        'INVALID_BAND_RANGE',
        'maxEmployees',
        'The last number of employees must not be below the first.'
      );
    }
    return {
      minEmployees,
      maxEmployees,
      baseFee: parseFee(pick(values, 'baseFee', current?.baseFee), 'baseFee'),
      perEmployeeFee: parseFee(pick(values, 'perEmployeeFee', current?.perEmployeeFee), 'perEmployeeFee'),
    };
  },
  validate(item, siblings) {
    if (!item.active) return;
    const clash = siblings.find(
      (other) =>
        other.id !== item.id &&
        other.active &&
        other.minEmployees <= item.maxEmployees &&
        item.minEmployees <= other.maxEmployees
    );
    if (clash) throw new BandsOverlapError(clash);
  },
  audited: (band) => ({
    minEmployees: band.minEmployees,
    maxEmployees: band.maxEmployees,
    baseFee: band.baseFee,
    perEmployeeFee: band.perEmployeeFee,
  }),
  label: (band) => `${band.minEmployees}–${band.maxEmployees}`,
  sort: (bands) => [...bands].sort((a, b) => a.minEmployees - b.minEmployees || a.maxEmployees - b.maxEmployees),
};

const PRICING_TYPES: readonly FrequencyPricingType[] = ['PERCENT', 'FIXED'];

export const frequencyRules: PricingListRules<VisitFrequency> = {
  build(values, current) {
    const labels = labelsOf(values, current);
    const visitsPerYear = pick(values, 'visitsPerYear', current?.visitsPerYear ?? null);
    const pricingType = pick(values, 'pricingType', current?.pricingType);
    if (!PRICING_TYPES.includes(pricingType as FrequencyPricingType)) {
      throw new InvalidPricingValueError('INVALID_PRICING_VALUE', 'pricingType', 'Choose a percentage or a fixed amount.');
    }
    const rawValue = pick(values, 'frequencyValue', current?.frequencyValue);
    return {
      ...labels,
      visitsPerYear: visitsPerYear === null ? null : parseWholeNumber(visitsPerYear, 'visitsPerYear', 1, 365),
      pricingType: pricingType as FrequencyPricingType,
      frequencyValue:
        pricingType === 'FIXED' ? parseFee(rawValue, 'frequencyValue') : parsePercent(rawValue, 'frequencyValue'),
    };
  },
  validate: checkNames,
  audited: (frequency) => ({
    nameSq: frequency.nameSq,
    nameEn: frequency.nameEn,
    visitsPerYear: frequency.visitsPerYear,
    pricingType: frequency.pricingType,
    frequencyValue: frequency.frequencyValue,
  }),
  label: (frequency) => frequency.nameSq,
  sort: sortByOrder,
};

export const zoneRules: PricingListRules<PriceZone> = {
  build(values, current) {
    return {
      ...labelsOf(values, current),
      surchargePercent: parsePercent(pick(values, 'surchargePercent', current?.surchargePercent), 'surchargePercent'),
      // Cities have their own use case, with their own audit entry.
      cityIds: current?.cityIds ?? [],
    };
  },
  validate: checkNames,
  audited: (zone) => ({ nameSq: zone.nameSq, nameEn: zone.nameEn, surchargePercent: zone.surchargePercent }),
  label: (zone) => zone.nameSq,
  sort: sortByOrder,
};

/** The longest description of a service or package, as the offer prints it. */
export const MAX_DESCRIPTION_LENGTH = 2000;

/** Optional sq/en descriptions: trimmed, an empty one cleared. */
function descriptionsOf(values: Record<string, unknown>, current: { descriptionSq: string | null; descriptionEn: string | null } | null) {
  const parse = (field: 'descriptionSq' | 'descriptionEn') => {
    const value = pick(values, field, current?.[field] ?? null);
    if (value === null) return null;
    if (typeof value !== 'string' || value.trim().length > MAX_DESCRIPTION_LENGTH) {
      throw new InvalidPricingValueError(
        'INVALID_PRICING_VALUE',
        field,
        `Enter a description of at most ${MAX_DESCRIPTION_LENGTH} characters.`
      );
    }
    return value.trim() || null;
  };
  return { descriptionSq: parse('descriptionSq'), descriptionEn: parse('descriptionEn') };
}

const describedAudit = (item: Service | ServicePackage) => ({
  nameSq: item.nameSq,
  nameEn: item.nameEn,
  descriptionSq: item.descriptionSq,
  descriptionEn: item.descriptionEn,
});

export const serviceRules: PricingListRules<Service> = {
  build: (values, current) => ({ ...labelsOf(values, current), ...descriptionsOf(values, current) }),
  validate: checkNames,
  audited: describedAudit,
  label: (service) => service.nameSq,
  sort: sortByOrder,
};

export const packageRules: PricingListRules<ServicePackage> = {
  build: (values, current) => ({
    ...labelsOf(values, current),
    ...descriptionsOf(values, current),
    // Services and the default flag have their own use cases, with their own audit entries.
    serviceIds: current?.serviceIds ?? [],
    isDefault: current?.isDefault ?? false,
  }),
  validate: checkNames,
  audited: describedAudit,
  label: (pkg) => pkg.nameSq,
  sort: sortByOrder,
};

export const PRICING_RULES: { [L in PricingList]: PricingListRules<PricingItemOf[L]> } = {
  [PricingList.Bands]: bandRules,
  [PricingList.Frequencies]: frequencyRules,
  [PricingList.Zones]: zoneRules,
  [PricingList.Services]: serviceRules,
  [PricingList.Packages]: packageRules,
};

/** Lists the Administrator can put in their own order; bands are always shown by employee range. */
export const ORDERED_PRICING_LISTS: readonly PricingList[] = [
  PricingList.Frequencies,
  PricingList.Zones,
  PricingList.Services,
  PricingList.Packages,
];

/**
 * The services a package may hold (FR-PCF-06): ids of this workspace's
 * services, without repeats, at least one of them active. A service already
 * in the package may stay after it was deactivated; only additions must be
 * active. Returns the ids in the order given.
 */
export function checkPackageServices(serviceIds: string[], services: Service[], current: string[] = []): string[] {
  const byId = new Map(services.map((service) => [service.id, service]));
  const kept = new Set(current);
  if (new Set(serviceIds).size !== serviceIds.length) {
    throw new InvalidPricingValueError('INVALID_PRICING_VALUE', 'serviceIds', 'List each service once.');
  }
  for (const id of serviceIds) {
    const service = byId.get(id);
    if (!service || (!service.active && !kept.has(id))) {
      throw new InvalidPricingValueError('SERVICE_NOT_ACTIVE', 'serviceIds', 'Choose active services from the list.');
    }
  }
  if (!serviceIds.some((id) => byId.get(id)!.active)) {
    throw new InvalidPricingValueError('PACKAGE_NEEDS_SERVICE', 'serviceIds', 'A package needs at least one active service.');
  }
  return serviceIds;
}
