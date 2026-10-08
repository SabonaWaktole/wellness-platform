import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import type { IMembershipSettingsStore } from '../application/ports/IMembershipSettingsStore';
import { DEFAULT_TIER_SETTINGS } from '../domain/DefaultMembership';
import { MembershipSettings } from '../domain/MembershipSettings';
import { TIERS, type Tier } from '../domain/Tier';
import { TierSetting } from '../domain/TierSetting';

export class PrismaMembershipSettingsStore implements IMembershipSettingsStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async getSettings(tenantId: string): Promise<MembershipSettings> {
    const row = await this.prisma.membershipSettings.findUnique({ where: { tenantId } });
    if (!row) return MembershipSettings.defaults(tenantId);
    return MembershipSettings.rebuild({
      tenantId,
      familyDiscountPercent: row.familyDiscountPercent.toString(),
      graceDays: row.graceDays,
      expiringSoonDays: row.expiringSoonDays,
      memberPrefix: row.memberPrefix,
      receiptPrefix: row.receiptPrefix,
      vipReviewNoticeDays: row.vipReviewNoticeDays,
    });
  }

  async saveSettings(settings: MembershipSettings, updatedByUserId: string | null): Promise<void> {
    const data = { ...settings.toJSON(), updatedByUserId };
    await this.prisma.membershipSettings.upsert({
      where: { tenantId: settings.tenantId },
      create: { tenantId: settings.tenantId, ...data },
      update: data,
    });
  }

  async getTiers(tenantId: string): Promise<TierSetting[]> {
    const rows = await this.prisma.tierSetting.findMany({ where: { tenantId } });
    return TIERS.map((tier) => {
      const row = rows.find((r) => r.tier === tier);
      if (row) {
        return TierSetting.rebuild(tier, {
          labelSq: row.labelSq,
          labelEn: row.labelEn,
          colour: row.colour,
          fee: row.fee === null ? null : row.fee.toString(),
          termMonths: row.termMonths,
        });
      }
      const d = DEFAULT_TIER_SETTINGS.find((t) => t.tier === (tier as Tier))!;
      return TierSetting.rebuild(tier, { labelSq: d.labelSq, labelEn: d.labelEn, colour: d.colour, fee: d.fee, termMonths: d.termMonths });
    });
  }

  async saveTier(tenantId: string, tier: TierSetting, updatedByUserId: string | null): Promise<void> {
    const data = { ...tier.toJSON(), updatedByUserId };
    await this.prisma.tierSetting.upsert({
      where: { tenantId_tier: { tenantId, tier: tier.tier } },
      create: { tenantId, tier: tier.tier, ...data },
      update: data,
    });
  }
}
