import { AccessContext } from '../../access/domain/AccessContext';
import { AuditAction } from '../../audit/domain/AuditAction';
import { AuditChange } from '../../audit/domain/AuditChange';
import { AuditEntry } from '../../audit/domain/AuditEntry';
import { PricingItemNotFoundError } from '../domain/errors';
import { PRICING_AUDIT_ENTITY, PRICING_RULES, PricingItem, PricingItemOf, PricingList, PricingListRules } from '../domain/PricingLists';
import { IPricingStore } from './ports/IPricingStore';

/**
 * Every read and write of the pricing configuration needs this. The values
 * are commercial, so unlike the M1 lookup lists nothing here is readable by
 * the rest of the workspace; salespeople get what they need through the
 * pricing screen's own endpoint (Slice 8).
 */
export const MANAGE_PRICING = 'pricing.manage';

/** The list's rules, typed loosely: the generic use cases only pass items of that same list through them. */
export const rulesFor = (list: PricingList) => PRICING_RULES[list] as unknown as PricingListRules<PricingItem>;

export async function findPricingItem<L extends PricingList>(
  store: IPricingStore,
  tenantId: string,
  list: L,
  id: string
): Promise<PricingItemOf[L]> {
  const item = await store.findById(tenantId, list, id);
  if (!item) {
    throw new PricingItemNotFoundError();
  }
  return item;
}

/** One audit entry for a pricing write (FR-AUD-09), by the signed-in user. */
export function pricingAuditEntry(
  access: AccessContext,
  tenantId: string,
  target: { entityType: string; entityId: string; entityLabel: string | null },
  action: AuditAction,
  changes: AuditChange[]
): AuditEntry {
  return {
    tenantId,
    userId: access.userId,
    userRole: access.auditRole,
    action,
    ...target,
    changes,
  };
}

/** The audit target of a list item: its entity type, id and label. */
export const listItemTarget = (list: PricingList, item: PricingItem) => ({
  entityType: PRICING_AUDIT_ENTITY[list],
  entityId: item.id,
  entityLabel: rulesFor(list).label(item),
});

/** Every audited field from `null` (a create) or to `null` (a delete). */
export function wholeItemChanges(fields: Record<string, unknown>, direction: 'created' | 'deleted'): AuditChange[] {
  return Object.entries(fields).map(([field, value]) =>
    direction === 'created' ? { field, old: null, new: value ?? null } : { field, old: value ?? null, new: null }
  );
}

/**
 * A zone's cities as the audit log shows them: "Tiranë (Tiranë)", sorted, so
 * two cities of the same name in different areas stay distinguishable.
 */
export async function zoneCityNames(store: IPricingStore, tenantId: string, cityIds: string[]): Promise<string[]> {
  if (cityIds.length === 0) return [];
  const cities = await store.cities(tenantId, cityIds);
  return cities.map((city) => `${city.nameSq} (${city.areaNameSq})`).sort((a, b) => a.localeCompare(b, 'sq'));
}
