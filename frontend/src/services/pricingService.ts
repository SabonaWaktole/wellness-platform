import { apiClient as api } from '../api';
import type { RichTextDoc } from '../types/form';

/**
 * Settings → Pricing's client (M2 Slices 3 and 4: FR-PCF-01..09). Amounts
 * and percentages arrive as two-decimal strings ("49.40"); the frontend only
 * formats them and never calculates a price (NFR-ACC-02).
 */
export type PricingListKey = 'bands' | 'frequencies' | 'zones' | 'services' | 'packages';

export type FrequencyPricingType = 'PERCENT' | 'FIXED';

export interface EmployeeBand {
  id: string;
  minEmployees: number;
  maxEmployees: number;
  baseFee: string;
  perEmployeeFee: string;
  order: number;
  active: boolean;
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
  cityIds: string[];
  order: number;
  active: boolean;
}

export interface RiskSurcharge {
  riskLevelId: string;
  level: number;
  nameSq: string;
  nameEn: string | null;
  active: boolean;
  /** `null` while no surcharge is set: that risk level prices as "Price on request". */
  riskSurchargePercent: string | null;
}

/** A service the offer describes (FR-PCF-06). It has no price. */
export interface Service {
  id: string;
  nameSq: string;
  nameEn: string | null;
  descriptionSq: string | null;
  descriptionEn: string | null;
  order: number;
  active: boolean;
}

/** A named set of services; exactly one active package is the default (FR-PCF-06). */
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

export const OFFER_TEXT_FIELDS = ['introSq', 'introEn', 'termsSq', 'termsEn', 'closingSq', 'closingEn'] as const;
export type OfferTextField = (typeof OFFER_TEXT_FIELDS)[number];

/** The offer settings (FR-PCF-08); the texts are TipTap JSON, sanitised by the server. */
export interface OfferSettings extends Record<OfferTextField, RichTextDoc | null> {
  offerValidityDays: number;
  contractMonthsDefault: number;
  offerNumberPrefix: string;
  companyName: string | null;
  nipt: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  bankDetails: string | null;
}

export interface PricingConfiguration {
  currency: string;
  discountCapPercent: string;
  bands: EmployeeBand[];
  riskSurcharges: RiskSurcharge[];
  frequencies: VisitFrequency[];
  zones: PriceZone[];
  services: Service[];
  packages: ServicePackage[];
  offerSettings: OfferSettings;
}

export interface CityWithoutZone {
  id: string;
  nameSq: string;
  nameEn: string | null;
  areaId: string;
  areaNameSq: string;
  areaNameEn: string | null;
}

export type PriceOnRequestReason = 'NO_BAND' | 'NO_ZONE' | 'NO_RISK_SURCHARGE';

export type TestCalculationResult =
  | {
      kind: 'PRICED';
      baseFee: string;
      riskFee: string;
      visitFee: string;
      locationFee: string;
      listPrice: string;
      pricePerEmployee: string;
      annualValue: string;
    }
  | { kind: 'PRICE_ON_REQUEST'; reason: PriceOnRequestReason };

export interface TestCalculationInput {
  employees: number;
  riskLevelId: string;
  frequencyId: string;
  zoneId: string;
}

/** The body of a create or update: the list's own fields. */
export type PricingValues = Record<string, unknown>;

const base = (tenantSlug: string) => `/${tenantSlug}/pricing`;

export const pricingService = {
  config: async (tenantSlug: string): Promise<PricingConfiguration> =>
    (await api.get<{ data: PricingConfiguration }>(`${base(tenantSlug)}/config`)).data.data,

  citiesWithoutZone: async (tenantSlug: string): Promise<CityWithoutZone[]> =>
    (await api.get<{ data: CityWithoutZone[] }>(`${base(tenantSlug)}/cities-without-zone`)).data.data,

  create: async (tenantSlug: string, list: PricingListKey, values: PricingValues): Promise<void> => {
    await api.post(`${base(tenantSlug)}/${list}`, values);
  },

  update: async (tenantSlug: string, list: PricingListKey, id: string, values: PricingValues): Promise<void> => {
    await api.patch(`${base(tenantSlug)}/${list}/${id}`, values);
  },

  /** Frequencies and zones only; bands are always shown by employee range. */
  reorder: async (tenantSlug: string, list: Exclude<PricingListKey, 'bands'>, ids: string[]): Promise<void> => {
    await api.put(`${base(tenantSlug)}/${list}/order`, { ids });
  },

  setActive: async (tenantSlug: string, list: PricingListKey, id: string, active: boolean): Promise<void> => {
    await api.post(`${base(tenantSlug)}/${list}/${id}/${active ? 'reactivate' : 'deactivate'}`);
  },

  remove: async (tenantSlug: string, list: PricingListKey, id: string): Promise<void> => {
    await api.delete(`${base(tenantSlug)}/${list}/${id}`);
  },

  setZoneCities: async (tenantSlug: string, zoneId: string, cityIds: string[]): Promise<void> => {
    await api.put(`${base(tenantSlug)}/zones/${zoneId}/cities`, { cityIds });
  },

  setRiskSurcharge: async (tenantSlug: string, riskLevelId: string, riskSurchargePercent: string): Promise<void> => {
    await api.put(`${base(tenantSlug)}/risk-surcharges/${riskLevelId}`, { riskSurchargePercent });
  },

  setDiscountCap: async (tenantSlug: string, discountCapPercent: string): Promise<void> => {
    await api.put(`${base(tenantSlug)}/discount-cap`, { discountCapPercent });
  },

  setPackageServices: async (tenantSlug: string, packageId: string, serviceIds: string[]): Promise<void> => {
    await api.put(`${base(tenantSlug)}/packages/${packageId}/services`, { serviceIds });
  },

  setDefaultPackage: async (tenantSlug: string, packageId: string): Promise<void> => {
    await api.post(`${base(tenantSlug)}/packages/${packageId}/default`);
  },

  /** Only the fields sent change. */
  updateOfferSettings: async (tenantSlug: string, changes: Partial<OfferSettings>): Promise<void> => {
    await api.put(`${base(tenantSlug)}/offer-settings`, changes);
  },

  testCalculation: async (tenantSlug: string, input: TestCalculationInput): Promise<TestCalculationResult> =>
    (await api.post<{ result: TestCalculationResult }>(`${base(tenantSlug)}/test-calculation`, input)).data.result,
};
