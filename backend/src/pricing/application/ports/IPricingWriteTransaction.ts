import { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';
import { PricingItemOf, PricingList } from '../../domain/PricingLists';

/** Writes to a workspace's pricing configuration. Every method takes `tenantId` first, so no write can cross tenants. */
export interface IPricingWrites {
  create<L extends PricingList>(tenantId: string, list: L, item: PricingItemOf[L]): Promise<void>;
  /** Replaces the item's editable fields, order and active flag with `item`'s. A zone's cities are left alone. */
  update<L extends PricingList>(tenantId: string, list: L, item: PricingItemOf[L]): Promise<void>;
  delete(tenantId: string, list: PricingList, id: string): Promise<void>;
  setZoneCities(tenantId: string, zoneId: string, cityIds: string[]): Promise<void>;
  upsertRiskSurcharge(tenantId: string, surcharge: { id: string; riskLevelId: string; percent: string }): Promise<void>;
  setDiscountCap(tenantId: string, discountCapPercent: string): Promise<void>;
}

export interface PricingWriteRepos {
  pricing: IPricingWrites;
  auditTrail: IAuditTrail;
}

/**
 * One transaction for a pricing write and its audit entry (FR-AUD-09): if the
 * audit write fails, the change rolls back.
 */
export interface IPricingWriteTransaction {
  run<T>(work: (repos: PricingWriteRepos) => Promise<T>): Promise<T>;
}
