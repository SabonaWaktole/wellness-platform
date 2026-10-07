import type { MembershipSettings } from '../../domain/MembershipSettings';
import type { TierSetting } from '../../domain/TierSetting';
import type { TierDiscounts } from '../../domain/BenefitTable';

export interface RelationshipRecord {
  id: string;
  nameSq: string;
  nameEn: string;
  order: number;
  active: boolean;
}

export interface BenefitServiceRecord {
  id: string;
  nameSq: string;
  nameEn: string;
  order: number;
  active: boolean;
  /** Every tier; null is no discount. */
  discounts: Record<'BRONZE' | 'SILVER' | 'GOLD' | 'VIP', string | null>;
}

/** The workspace's Wellness+ rules and tier settings; defaults until a row is saved. */
export interface IMembershipSettingsStore {
  getSettings(tenantId: string): Promise<MembershipSettings>;
  saveSettings(settings: MembershipSettings, updatedByUserId: string | null): Promise<void>;
  /** The four tiers in order, the defaults for one that has no row. */
  getTiers(tenantId: string): Promise<TierSetting[]>;
  saveTier(tenantId: string, tier: TierSetting, updatedByUserId: string | null): Promise<void>;
}

export interface IRelationshipStore {
  list(tenantId: string): Promise<RelationshipRecord[]>;
  find(tenantId: string, id: string): Promise<RelationshipRecord | null>;
  create(tenantId: string, values: Omit<RelationshipRecord, 'id'>): Promise<RelationshipRecord>;
  update(tenantId: string, record: RelationshipRecord): Promise<void>;
}

export interface IBenefitStore {
  list(tenantId: string): Promise<BenefitServiceRecord[]>;
  find(tenantId: string, id: string): Promise<BenefitServiceRecord | null>;
  create(tenantId: string, values: Omit<BenefitServiceRecord, 'id'>): Promise<BenefitServiceRecord>;
  /** Replaces the service's names, order and active flag, and sets the tiers named in `discounts`. */
  update(tenantId: string, record: BenefitServiceRecord, changedDiscounts: TierDiscounts): Promise<void>;
}
