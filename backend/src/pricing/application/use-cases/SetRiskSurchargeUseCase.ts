import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { PricingItemNotFoundError } from '../../domain/errors';
import { parsePercent } from '../../domain/PricingValues';
import { MANAGE_PRICING, pricingAuditEntry } from '../pricingAdmin';
import { IPricingStore, RiskSurchargeRecord } from '../ports/IPricingStore';
import { IPricingWriteTransaction } from '../ports/IPricingWriteTransaction';

/**
 * Sets the risk surcharge % of one M1 risk level (FR-PCF-02). Changing Medium
 * from 10% to 12% changes new calculations only. The first value set for a
 * level is audited as a create, later ones as updates.
 */
export class SetRiskSurchargeUseCase {
  constructor(
    private readonly store: IPricingStore,
    private readonly writeTx: IPricingWriteTransaction
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    riskLevelId: string;
    riskSurchargePercent: unknown;
  }): Promise<Omit<RiskSurchargeRecord, 'surchargeId'>> {
    input.access.ensure(MANAGE_PRICING);
    const current = (await this.store.riskSurcharges(input.tenantId)).find((row) => row.riskLevelId === input.riskLevelId);
    if (!current) {
      throw new PricingItemNotFoundError();
    }

    const percent = parsePercent(input.riskSurchargePercent, 'riskSurchargePercent');
    const { surchargeId, ...rest } = current;
    const next = { ...rest, riskSurchargePercent: percent };
    if (current.riskSurchargePercent === percent) {
      return next;
    }

    const id = surchargeId ?? randomUUID();
    await this.writeTx.run(async ({ pricing, auditTrail }) => {
      await pricing.upsertRiskSurcharge(input.tenantId, { id, riskLevelId: current.riskLevelId, percent });
      await auditTrail.record(
        pricingAuditEntry(
          input.access,
          input.tenantId,
          { entityType: 'RiskSurcharge', entityId: id, entityLabel: current.nameSq },
          surchargeId ? AuditAction.Update : AuditAction.Create,
          [{ field: 'riskSurchargePercent', old: current.riskSurchargePercent, new: percent }]
        )
      );
    });
    return next;
  }
}
