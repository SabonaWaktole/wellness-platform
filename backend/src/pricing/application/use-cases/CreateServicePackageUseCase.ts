import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { checkPackageServices, PricingList, ServicePackage } from '../../domain/PricingLists';
import { listItemTarget, MANAGE_PRICING, packageServiceNames, pricingAuditEntry, rulesFor, wholeItemChanges } from '../pricingAdmin';
import { IPricingStore } from '../ports/IPricingStore';
import { IPricingWriteTransaction } from '../ports/IPricingWriteTransaction';

/**
 * Adds a service package with its services, in order (FR-PCF-06). A package
 * needs at least one active service. It becomes the default when the
 * workspace has no active default, so there is always exactly one.
 */
export class CreateServicePackageUseCase {
  constructor(
    private readonly store: IPricingStore,
    private readonly writeTx: IPricingWriteTransaction
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    values: Record<string, unknown>;
    serviceIds: string[];
  }): Promise<ServicePackage> {
    input.access.ensure(MANAGE_PRICING);
    const rules = rulesFor(PricingList.Packages);
    const [siblings, services] = await Promise.all([
      this.store.list(input.tenantId, PricingList.Packages),
      this.store.list(input.tenantId, PricingList.Services),
    ]);

    const order = siblings.reduce((max, item) => Math.max(max, item.order), 0) + 1;
    const pkg: ServicePackage = {
      ...(rules.build(input.values, null) as Omit<ServicePackage, 'id' | 'order' | 'active'>),
      id: randomUUID(),
      order,
      active: true,
      serviceIds: checkPackageServices(input.serviceIds, services),
      isDefault: !siblings.some((other) => other.active && other.isDefault),
    };
    rules.validate(pkg, siblings);

    await this.writeTx.run(async ({ pricing, auditTrail }) => {
      await pricing.create(input.tenantId, PricingList.Packages, pkg);
      await auditTrail.record(
        pricingAuditEntry(input.access, input.tenantId, listItemTarget(PricingList.Packages, pkg), AuditAction.Create, [
          ...wholeItemChanges(rules.audited(pkg), 'created'),
          { field: 'services', old: null, new: packageServiceNames(services, pkg.serviceIds) },
          { field: 'isDefault', old: null, new: pkg.isDefault },
        ])
      );
    });
    return pkg;
  }
}
