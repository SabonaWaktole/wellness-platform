import type { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import type { AuditChange } from '../../../audit/domain/AuditChange';
import type { MembershipSettingsValues } from '../../domain/MembershipSettings';
import type { TierSetting, TierSettingValues } from '../../domain/TierSetting';
import { TIERS, type Tier } from '../../domain/Tier';
import { MANAGE_WELLNESS_SETTINGS } from '../membershipPermissions';
import type { IMembershipSettingsStore } from '../ports/IMembershipSettingsStore';
import type { IMembershipWriteTransaction } from '../ports/IMembershipWriteTransaction';

export class UnknownTierError extends Error {
  readonly code = 'UNKNOWN_TIER';
  constructor(tier: string) {
    super(`Unknown tier ${tier}.`);
  }
}

export interface MembershipSettingsView {
  settings: MembershipSettingsValues;
  tiers: Array<{ tier: Tier } & TierSettingValues>;
}

const changesBetween = <T extends object>(before: T, after: T): AuditChange[] =>
  (Object.keys(after) as (keyof T & string)[])
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({ field, old: before[field], new: after[field] }));

const tierView = (tier: TierSetting) => ({ tier: tier.tier, ...tier.toJSON() });

/** Rules and the four tiers, for the Administrator (FR-TIR-01). */
export class GetMembershipSettingsUseCase {
  constructor(private readonly store: IMembershipSettingsStore) {}

  async execute(input: { access: AccessContext; tenantId: string }): Promise<MembershipSettingsView> {
    input.access.ensure(MANAGE_WELLNESS_SETTINGS);
    const [settings, tiers] = await Promise.all([this.store.getSettings(input.tenantId), this.store.getTiers(input.tenantId)]);
    return { settings: settings.toJSON(), tiers: tiers.map(tierView) };
  }
}

/**
 * FR-TIR-05, FR-TIR-10, FR-FAM-04, FR-MEM-03, FR-MPAY-05, FR-VIP-04: the
 * workspace rules. Only the fields sent change; one audit entry with old and
 * new values in the same transaction (FR-AUD-14). Unchanged values write nothing.
 */
export class UpdateMembershipSettingsUseCase {
  constructor(
    private readonly store: IMembershipSettingsStore,
    private readonly writeTx: IMembershipWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; patch: Partial<MembershipSettingsValues> }): Promise<MembershipSettingsValues> {
    input.access.ensure(MANAGE_WELLNESS_SETTINGS);
    const current = await this.store.getSettings(input.tenantId);
    const next = current.with(input.patch);
    const changes = changesBetween(current.toJSON(), next.toJSON());
    if (changes.length === 0) return current.toJSON();

    await this.writeTx.run(async ({ settingsStore, auditTrail }) => {
      await settingsStore.saveSettings(next, input.access.userId);
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Update,
        entityType: 'MembershipSettings',
        entityId: input.tenantId,
        entityLabel: 'Rules',
        changes,
      });
    });
    return next.toJSON();
  }
}

/**
 * FR-TIR-01: label, colour, fee and term of one tier. A new fee applies to
 * payments recorded later; nothing stored on a payment changes.
 */
export class UpdateTierSettingUseCase {
  constructor(
    private readonly store: IMembershipSettingsStore,
    private readonly writeTx: IMembershipWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; tier: string; patch: Partial<TierSettingValues> }) {
    input.access.ensure(MANAGE_WELLNESS_SETTINGS);
    if (!(TIERS as readonly string[]).includes(input.tier)) throw new UnknownTierError(input.tier);
    const tiers = await this.store.getTiers(input.tenantId);
    const current = tiers.find((t) => t.tier === input.tier)!;
    const next = current.with(input.patch);
    const changes = changesBetween(current.toJSON(), next.toJSON());
    if (changes.length === 0) return tierView(current);

    await this.writeTx.run(async ({ settingsStore, auditTrail }) => {
      await settingsStore.saveTier(input.tenantId, next, input.access.userId);
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Update,
        entityType: 'MembershipSettings',
        entityId: input.tenantId,
        entityLabel: `Tier ${input.tier}`,
        changes,
      });
    });
    return tierView(next);
  }
}
