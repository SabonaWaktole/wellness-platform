import { apiClient as api } from '../api';

export type Tier = 'BRONZE' | 'SILVER' | 'GOLD' | 'VIP';
export const TIERS: Tier[] = ['BRONZE', 'SILVER', 'GOLD', 'VIP'];

export interface TierSetting {
  tier: Tier;
  labelSq: string;
  labelEn: string;
  colour: string;
  /** Money as a string; null for a free tier. */
  fee: string | null;
  termMonths: number | null;
}

export interface MembershipRules {
  familyDiscountPercent: string;
  graceDays: number;
  expiringSoonDays: number;
  memberPrefix: string;
  receiptPrefix: string;
  vipReviewNoticeDays: number;
}

export interface Relationship {
  id: string;
  nameSq: string;
  nameEn: string;
  order: number;
  active: boolean;
}

export interface BenefitService {
  id: string;
  nameSq: string;
  nameEn: string;
  order: number;
  active: boolean;
  discounts: Record<Tier, string | null>;
}

export interface BenefitTable {
  tiers: Array<Pick<TierSetting, 'tier' | 'labelSq' | 'labelEn' | 'colour'>>;
  services: BenefitService[];
}

const base = (slug: string) => `/${slug}/membership`;

/** The Wellness+ settings API (M4 Slice 3). Settings are the Administrator's; the benefit table is read by anyone who can view or verify members. */
export const membershipSettingsService = {
  getSettings: async (slug: string) =>
    (await api.get<{ data: { settings: MembershipRules; tiers: TierSetting[] } }>(`${base(slug)}/settings`)).data.data,
  updateRules: async (slug: string, patch: Partial<Omit<MembershipRules, 'familyDiscountPercent'>> & { familyDiscountPercent?: string }) =>
    (await api.patch<{ data: MembershipRules }>(`${base(slug)}/settings`, patch)).data.data,
  updateTier: async (slug: string, tier: Tier, patch: Partial<Omit<TierSetting, 'tier'>>) =>
    (await api.patch<{ data: TierSetting }>(`${base(slug)}/settings/tiers/${tier}`, patch)).data.data,

  listRelationships: async (slug: string) => (await api.get<{ data: Relationship[] }>(`${base(slug)}/settings/relationships`)).data.data,
  createRelationship: async (slug: string, body: Pick<Relationship, 'nameSq' | 'nameEn'>) =>
    (await api.post<{ data: Relationship }>(`${base(slug)}/settings/relationships`, body)).data.data,
  updateRelationship: async (slug: string, id: string, patch: Partial<Omit<Relationship, 'id'>>) =>
    (await api.patch<{ data: Relationship }>(`${base(slug)}/settings/relationships/${id}`, patch)).data.data,

  getBenefits: async (slug: string) => (await api.get<{ data: BenefitTable }>(`${base(slug)}/benefits`)).data.data,
  createBenefit: async (slug: string, body: Pick<BenefitService, 'nameSq' | 'nameEn'> & { discounts?: Partial<Record<Tier, string | null>> }) =>
    (await api.post<{ data: BenefitService }>(`${base(slug)}/settings/benefits`, body)).data.data,
  updateBenefit: async (
    slug: string,
    id: string,
    patch: Partial<Pick<BenefitService, 'nameSq' | 'nameEn' | 'active'>> & { discounts?: Partial<Record<Tier, string | null>> }
  ) => (await api.patch<{ data: BenefitService }>(`${base(slug)}/settings/benefits/${id}`, patch)).data.data,
};

/** The field a server refusal names, if any. */
export const refusedField = (err: unknown): string | null => (err as { response?: { data?: { field?: string } } })?.response?.data?.field ?? null;
