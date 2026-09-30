import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { parsePercent } from '../../domain/PricingValues';
import { MANAGE_PRICING, pricingAuditEntry } from '../pricingAdmin';
import { IPricingStore, PricingSettingsRecord } from '../ports/IPricingStore';
import { IPricingWriteTransaction } from '../ports/IPricingWriteTransaction';

/**
 * Sets the discount cap: the highest discount % a salesperson may apply
 * without approval (FR-PCF-07). A discount cannot exceed the price, so the
 * cap is 0–100, not the 0–1000 of the surcharges.
 */
export class SetDiscountCapUseCase {
  constructor(
    private readonly store: IPricingStore,
    private readonly writeTx: IPricingWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; discountCapPercent: unknown }): Promise<PricingSettingsRecord> {
    input.access.ensure(MANAGE_PRICING);
    const current = await this.store.settings(input.tenantId);
    const discountCapPercent = parsePercent(input.discountCapPercent, 'discountCapPercent', 100);
    if (current.discountCapPercent === discountCapPercent) {
      return current;
    }

    await this.writeTx.run(async ({ pricing, auditTrail }) => {
      await pricing.setDiscountCap(input.tenantId, discountCapPercent);
      await auditTrail.record(
        pricingAuditEntry(
          input.access,
          input.tenantId,
          { entityType: 'PricingSettings', entityId: input.tenantId, entityLabel: null },
          AuditAction.Update,
          [{ field: 'discountCapPercent', old: current.discountCapPercent, new: discountCapPercent }]
        )
      );
    });
    return { ...current, discountCapPercent };
  }
}
