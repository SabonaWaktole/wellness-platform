import type { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { checkDiscounts, checkNames, checkOrder, InvalidBenefitError, type TierDiscounts } from '../../domain/BenefitTable';
import { TIERS, type Tier } from '../../domain/Tier';
import { MANAGE_WELLNESS_SETTINGS, MEMBERS_VERIFY, MEMBERS_VIEW } from '../membershipPermissions';
import type { BenefitServiceRecord, IBenefitStore, IMembershipSettingsStore } from '../ports/IMembershipSettingsStore';
import type { IMembershipWriteTransaction } from '../ports/IMembershipWriteTransaction';

export class BenefitServiceNotFoundError extends Error {
  readonly code = 'BENEFIT_SERVICE_NOT_FOUND';
  constructor() {
    super('Benefit service not found.');
  }
}

const refuseName = (field: 'nameSq' | 'nameEn') => new InvalidBenefitError(field, 'The name is required in Albanian and English.');
const refuseOrder = () => new InvalidBenefitError('order', 'The order must be a whole number from 0 to 10000.');

export interface BenefitInput {
  nameSq?: unknown;
  nameEn?: unknown;
  order?: unknown;
  active?: boolean;
  discounts?: unknown;
}

export interface BenefitTableView {
  tiers: Array<{ tier: Tier; labelSq: string; labelEn: string; colour: string }>;
  services: BenefitServiceRecord[];
}

const noDiscounts = (): BenefitServiceRecord['discounts'] => ({ BRONZE: null, SILVER: null, GOLD: null, VIP: null });

/**
 * The benefit table with the tiers as columns (FR-BEN-04). Read only, for
 * "Members: view" or "Members: verify"; the Administrator also sees inactive
 * services, and nobody sees a fee here.
 */
export class GetBenefitTableUseCase {
  constructor(
    private readonly benefits: IBenefitStore,
    private readonly settings: IMembershipSettingsStore
  ) {}

  async execute(input: { access: AccessContext; tenantId: string }): Promise<BenefitTableView> {
    const { access } = input;
    if (![MEMBERS_VIEW, MEMBERS_VERIFY, MANAGE_WELLNESS_SETTINGS].some((key) => access.can(key))) access.ensure(MEMBERS_VIEW);
    const [services, tiers] = await Promise.all([this.benefits.list(input.tenantId), this.settings.getTiers(input.tenantId)]);
    return {
      tiers: tiers.map((t) => ({ tier: t.tier, labelSq: t.labelSq, labelEn: t.labelEn, colour: t.colour })),
      services: access.can(MANAGE_WELLNESS_SETTINGS) ? services : services.filter((s) => s.active),
    };
  }
}

/**
 * The discounts a tier gets: the active services with a percent (FR-BEN-03,
 * used by the card and verification later). Reads the table each time, so a
 * change applies at once and nothing is cached (FR-BEN-05).
 */
export class BenefitsForTier {
  constructor(private readonly benefits: IBenefitStore) {}

  async execute(tenantId: string, tier: Tier): Promise<Array<{ serviceId: string; nameSq: string; nameEn: string; percent: string }>> {
    const services = await this.benefits.list(tenantId);
    return services
      .filter((s) => s.active && s.discounts[tier] !== null)
      .map((s) => ({ serviceId: s.id, nameSq: s.nameSq, nameEn: s.nameEn, percent: s.discounts[tier] as string }));
  }
}

const discountChanges = (before: BenefitServiceRecord['discounts'], after: BenefitServiceRecord['discounts']) =>
  TIERS.filter((tier) => before[tier] !== after[tier]).map((tier) => ({ field: `discount.${tier}`, old: before[tier], new: after[tier] }));

/** FR-BEN-01, FR-BEN-02, FR-AUD-14: add a service with its discounts. */
export class CreateBenefitServiceUseCase {
  constructor(
    private readonly benefits: IBenefitStore,
    private readonly writeTx: IMembershipWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; body: BenefitInput }): Promise<BenefitServiceRecord> {
    input.access.ensure(MANAGE_WELLNESS_SETTINGS);
    const names = checkNames({ nameSq: input.body.nameSq, nameEn: input.body.nameEn }, refuseName);
    const given = checkDiscounts(input.body.discounts ?? {});
    const discounts = { ...noDiscounts(), ...given } as BenefitServiceRecord['discounts'];
    const existing = await this.benefits.list(input.tenantId);
    const order = input.body.order === undefined ? existing.reduce((max, s) => Math.max(max, s.order), 0) + 1 : checkOrder(input.body.order);
    if (order === null) throw refuseOrder();

    return this.writeTx.run(async ({ benefitStore, auditTrail }) => {
      const record = await benefitStore.create(input.tenantId, { ...names, order, active: input.body.active ?? true, discounts });
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Create,
        entityType: 'MembershipSettings',
        entityId: record.id,
        entityLabel: `Benefit ${record.nameEn}`,
        changes: [
          { field: 'nameSq', old: null, new: record.nameSq },
          { field: 'nameEn', old: null, new: record.nameEn },
          ...discountChanges(noDiscounts(), record.discounts),
        ],
      });
      return record;
    });
  }
}

/**
 * FR-BEN-01, FR-BEN-05: rename, reorder, deactivate, or change the discounts
 * of the tiers named. One audit entry with the old and new value of each
 * changed field, and nothing when nothing changed.
 */
export class UpdateBenefitServiceUseCase {
  constructor(
    private readonly benefits: IBenefitStore,
    private readonly writeTx: IMembershipWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; id: string; body: BenefitInput }): Promise<BenefitServiceRecord> {
    input.access.ensure(MANAGE_WELLNESS_SETTINGS);
    const current = await this.benefits.find(input.tenantId, input.id);
    if (!current) throw new BenefitServiceNotFoundError();

    const names = checkNames({ nameSq: input.body.nameSq ?? current.nameSq, nameEn: input.body.nameEn ?? current.nameEn }, refuseName);
    const order = input.body.order === undefined ? current.order : checkOrder(input.body.order);
    if (order === null) throw refuseOrder();
    const given: TierDiscounts = input.body.discounts === undefined ? {} : checkDiscounts(input.body.discounts);
    const discounts = { ...current.discounts, ...given } as BenefitServiceRecord['discounts'];
    const next: BenefitServiceRecord = { id: current.id, ...names, order, active: input.body.active ?? current.active, discounts };

    const changes = [
      ...(['nameSq', 'nameEn', 'order', 'active'] as const)
        .filter((field) => current[field] !== next[field])
        .map((field) => ({ field, old: current[field], new: next[field] })),
      ...discountChanges(current.discounts, next.discounts),
    ];
    if (changes.length === 0) return current;

    await this.writeTx.run(async ({ benefitStore, auditTrail }) => {
      await benefitStore.update(input.tenantId, next, given);
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Update,
        entityType: 'MembershipSettings',
        entityId: current.id,
        entityLabel: `Benefit ${current.nameEn}`,
        changes,
      });
    });
    return next;
  }
}
