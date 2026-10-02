import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { checkPackageServices, PricingList, ServicePackage } from '../../domain/PricingLists';
import { findPricingItem, listItemTarget, MANAGE_PRICING, packageServiceNames, pricingAuditEntry } from '../pricingAdmin';
import { IPricingStore } from '../ports/IPricingStore';
import { IPricingWriteTransaction } from '../ports/IPricingWriteTransaction';

/**
 * Replaces the services of a package, in the order the offer lists them
 * (FR-PCF-06). At least one must be active; a service already in the package
 * may stay after it was deactivated. Audited on the package as the list of
 * service names before and after.
 */
export class SetPackageServicesUseCase {
  constructor(
    private readonly store: IPricingStore,
    private readonly writeTx: IPricingWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; packageId: string; serviceIds: string[] }): Promise<ServicePackage> {
    input.access.ensure(MANAGE_PRICING);
    const pkg = await findPricingItem(this.store, input.tenantId, PricingList.Packages, input.packageId);
    const services = await this.store.list(input.tenantId, PricingList.Services);
    const serviceIds = checkPackageServices(input.serviceIds, services, pkg.serviceIds);

    const next: ServicePackage = { ...pkg, serviceIds };
    if (serviceIds.join('\n') === pkg.serviceIds.join('\n')) {
      return next;
    }

    await this.writeTx.run(async ({ pricing, auditTrail }) => {
      await pricing.setPackageServices(input.tenantId, pkg.id, serviceIds);
      await auditTrail.record(
        pricingAuditEntry(input.access, input.tenantId, listItemTarget(PricingList.Packages, pkg), AuditAction.Update, [
          { field: 'services', old: packageServiceNames(services, pkg.serviceIds), new: packageServiceNames(services, serviceIds) },
        ])
      );
    });
    return next;
  }
}
