import { apiClient as api } from '../api';

/**
 * Settings → Pricing's client (M2 Slice 3: FR-PCF-01..05, 07, 09). Amounts
 * and percentages arrive as two-decimal strings ("49.40"); the frontend only
 * formats them and never calculates a price (NFR-ACC-02).
 */
export type PricingListKey = 'bands' | 'frequencies' | 'zones';

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

export interface PricingConfiguration {
  currency: string;
  discountCapPercent: string;
  bands: EmployeeBand[];
  riskSurcharges: RiskSurcharge[];
  frequencies: VisitFrequency[];
  zones: PriceZone[];
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

  testCalculation: async (tenantSlug: string, input: TestCalculationInput): Promise<TestCalculationResult> =>
    (await api.post<{ result: TestCalculationResult }>(`${base(tenantSlug)}/test-calculation`, input)).data.result,
};
