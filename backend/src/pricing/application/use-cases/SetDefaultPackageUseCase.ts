import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { PricingConflictError } from '../../domain/errors';
import { PricingList, ServicePackage } from '../../domain/PricingLists';
import { findPricingItem, listItemTarget, MANAGE_PRICING, pricingAuditEntry } from '../pricingAdmin';
import { IPricingStore } from '../ports/IPricingStore';
import { IPricingWriteTransaction } from '../ports/IPricingWriteTransaction';

/**
 * Makes an active package the one the pricing screen preselects (FR-PCF-06).
 * The previous default stops being one in the same transaction, so there is
 * always exactly one. One audit entry on each package whose flag changed.
 */
export class SetDefaultPackageUseCase {
  constructor(
    private readonly store: IPricingStore,
    private readonly writeTx: IPricingWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; packageId: string }): Promise<ServicePackage> {
    input.access.ensure(MANAGE_PRICING);
    const pkg = await findPricingItem(this.store, input.tenantId, PricingList.Packages, input.packageId);
    if (pkg.isDefault) {
      return pkg;
    }
    if (!pkg.active) {
      throw new PricingConflictError('DEFAULT_PACKAGE_REQUIRED', 'Reactivate this package before making it the default.', [pkg.nameSq]);
    }
    const previous = (await this.store.list(input.tenantId, PricingList.Packages)).filter((other) => other.isDefault);

    await this.writeTx.run(async ({ pricing, auditTrail }) => {
      await pricing.setDefaultPackage(input.tenantId, pkg.id);
      for (const other of previous) {
        await auditTrail.record(
          pricingAuditEntry(input.access, input.tenantId, listItemTarget(PricingList.Packages, other), AuditAction.Update, [
            { field: 'isDefault', old: true, new: false },
          ])
        );
      }
      await auditTrail.record(
        pricingAuditEntry(input.access, input.tenantId, listItemTarget(PricingList.Packages, pkg), AuditAction.Update, [
          { field: 'isDefault', old: false, new: true },
        ])
      );
    });
    return { ...pkg, isDefault: true };
  }
}
