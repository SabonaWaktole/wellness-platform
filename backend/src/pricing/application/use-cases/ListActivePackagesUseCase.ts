import { AccessContext } from '../../../access/domain/AccessContext';
import { PricingList, Service, ServicePackage } from '../../domain/PricingLists';
import { rulesFor } from '../pricingAdmin';
import { IPricingStore } from '../ports/IPricingStore';

/** Holding `offers.edit`, a salesperson may choose a package for an offer. */
export const EDIT_OFFERS = 'offers.edit';

export type ActiveService = Omit<Service, 'order' | 'active'>;

export interface ActivePackage extends Omit<ServicePackage, 'serviceIds' | 'order' | 'active'> {
  /** The package's active services, in the order the offer lists them. */
  services: ActiveService[];
}

/**
 * The packages a salesperson can choose on the pricing screen (FR-PRC, Slice
 * 8): active ones, the default first, each with its active services in
 * order. Labels and descriptions only; a package does not change the price
 * (Q11), so nothing here is commercial.
 */
export class ListActivePackagesUseCase {
  constructor(private readonly store: IPricingStore) {}

  async execute(input: { access: AccessContext; tenantId: string }): Promise<ActivePackage[]> {
    input.access.ensure(EDIT_OFFERS);
    return activePackages(this.store, input.tenantId);
  }
}

/** The active packages, the default first, each with its active services in order. No permission check. */
export async function activePackages(store: IPricingStore, tenantId: string): Promise<ActivePackage[]> {
  const [packages, services] = await Promise.all([
    store.list(tenantId, PricingList.Packages),
    store.list(tenantId, PricingList.Services),
  ]);
  const activeServices = new Map(services.filter((service) => service.active).map((service) => [service.id, service]));

  return (rulesFor(PricingList.Packages).sort(packages) as ServicePackage[])
    .filter((pkg) => pkg.active)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
    .map(({ serviceIds, order: _order, active: _active, ...pkg }) => ({
      ...pkg,
      services: serviceIds
        .filter((id) => activeServices.has(id))
        .map((id) => {
          const { order: _o, active: _a, ...service } = activeServices.get(id)!;
          return service;
        }),
    }));
}
