import { OfferSettings } from '../../domain/OfferSettings';
import { PricingItemOf, PricingList } from '../../domain/PricingLists';

export interface PricingSettingsRecord {
  currency: string;
  discountCapPercent: string;
  /** FR-PCF-08 (Slice 4). */
  offerSettings: OfferSettings;
}

/** One M1 risk level with its surcharge, or `null` where none is set ("Price on request"). */
export interface RiskSurchargeRecord {
  riskLevelId: string;
  level: number;
  nameSq: string;
  nameEn: string | null;
  active: boolean;
  /** The surcharge row's own id, `null` while none is set. */
  surchargeId: string | null;
  riskSurchargePercent: string | null;
}

export interface CityRecord {
  id: string;
  nameSq: string;
  nameEn: string | null;
  areaId: string;
  areaNameSq: string;
  areaNameEn: string | null;
  active: boolean;
}

/** Reads of a workspace's pricing configuration. Every method takes `tenantId` first. */
export interface IPricingStore {
  settings(tenantId: string): Promise<PricingSettingsRecord>;
  list<L extends PricingList>(tenantId: string, list: L): Promise<PricingItemOf[L][]>;
  findById<L extends PricingList>(tenantId: string, list: L, id: string): Promise<PricingItemOf[L] | null>;
  riskSurcharges(tenantId: string): Promise<RiskSurchargeRecord[]>;
  /** The workspace's cities among `ids`, active or not, in no particular order. */
  cities(tenantId: string, ids: string[]): Promise<CityRecord[]>;
  /** Active cities in no active price zone (FR-PCF-05), in area then city order. */
  citiesWithoutZone(tenantId: string): Promise<CityRecord[]>;
}
