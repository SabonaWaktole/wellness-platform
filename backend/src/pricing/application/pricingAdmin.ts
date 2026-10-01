import { AccessContext } from '../../access/domain/AccessContext';
import { AuditAction } from '../../audit/domain/AuditAction';
import { AuditChange } from '../../audit/domain/AuditChange';
import { AuditEntry } from '../../audit/domain/AuditEntry';
import { PricingConflictError, PricingItemNotFoundError } from '../domain/errors';
import {
  PRICING_AUDIT_ENTITY,
  PRICING_RULES,
  PricingItem,
  PricingItemOf,
  PricingList,
  PricingListRules,
  Service,
  ServicePackage,
} from '../domain/PricingLists';
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

/** A package's services as the audit log shows them: their Albanian names, in the package's order. */
export function packageServiceNames(services: Service[], serviceIds: string[]): string[] {
  const names = new Map(services.map((service) => [service.id, service.nameSq]));
  return serviceIds.map((id) => names.get(id) ?? id);
}

const activeServiceCount = (pkg: ServicePackage, services: Service[]) =>
  pkg.serviceIds.filter((id) => services.some((service) => service.id === id && service.active)).length;

/**
 * The rules between services and packages (FR-PCF-06) that a deactivation,
 * reactivation or delete must keep: the default package stays active and
 * present until another one is the default; no active package is left
 * without an active service; a service in a package is in use, so it can be
 * deactivated but not deleted. The other lists have no such rules.
 */
export async function ensureListRulesKept(
  store: IPricingStore,
  tenantId: string,
  list: PricingList,
  item: PricingItem,
  change: 'deactivate' | 'reactivate' | 'delete'
): Promise<void> {
  if (list === PricingList.Packages) {
    const pkg = item as ServicePackage;
    if (pkg.isDefault && change !== 'reactivate') {
      throw new PricingConflictError('DEFAULT_PACKAGE_REQUIRED', 'Make another package the default first.', [pkg.nameSq]);
    }
    if (change === 'reactivate' && activeServiceCount(pkg, await store.list(tenantId, PricingList.Services)) === 0) {
      throw new PricingConflictError('SERVICE_LAST_IN_PACKAGE', 'Add an active service to this package first.', [pkg.nameSq]);
    }
    return;
  }
  if (list !== PricingList.Services || change === 'reactivate') return;

  const service = item as Service;
  const packages = (await store.list(tenantId, PricingList.Packages)).filter((pkg) => pkg.serviceIds.includes(service.id));
  if (change === 'delete' && packages.length > 0) {
    throw new PricingConflictError(
      'PRICING_ITEM_IN_USE',
      'This service is in a package. Remove it from the package or deactivate it instead.',
      packages.map((pkg) => pkg.nameSq)
    );
  }
  if (change === 'deactivate' && service.active) {
    const services = await store.list(tenantId, PricingList.Services);
    const stranded = packages.filter((pkg) => pkg.active && activeServiceCount(pkg, services) === 1);
    if (stranded.length > 0) {
      throw new PricingConflictError(
        'SERVICE_LAST_IN_PACKAGE',
        'This is the only active service of a package. Add another service to it first.',
        stranded.map((pkg) => pkg.nameSq)
      );
    }
  }
}
