import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_BENEFITS,
  DEFAULT_MEMBERSHIP_SETTINGS,
  DEFAULT_RELATIONSHIPS,
  DEFAULT_TIER_SETTINGS,
  defaultBenefitPercent,
} from '../domain/DefaultMembership';
import { TIERS } from '../domain/Tier';

/** Gives a new workspace the SRS M4 defaults, as the migration does for existing ones (NFR-OPS-04). */
export class PrismaMembershipSeeder {
  constructor(private readonly prisma: PrismaClient) {}

  async seed(tenantId: string): Promise<void> {
    await this.prisma.tierSetting.createMany({
      data: DEFAULT_TIER_SETTINGS.map((t) => ({ tenantId, tier: t.tier, labelSq: t.labelSq, labelEn: t.labelEn, colour: t.colour, fee: t.fee, termMonths: t.termMonths })),
    });
    await this.prisma.membershipSettings.create({ data: { tenantId, ...DEFAULT_MEMBERSHIP_SETTINGS } });
    await this.prisma.familyRelationship.createMany({
      data: DEFAULT_RELATIONSHIPS.map((r, index) => ({ id: randomUUID(), tenantId, nameSq: r.nameSq, nameEn: r.nameEn, order: index + 1 })),
    });
    const services = DEFAULT_BENEFITS.map((b, index) => ({ id: randomUUID(), tenantId, nameSq: b.nameSq, nameEn: b.nameEn, order: index + 1, benefit: b }));
    await this.prisma.benefitService.createMany({ data: services.map(({ benefit: _benefit, ...row }) => row) });
    const discounts = services.flatMap((s) =>
      TIERS.flatMap((tier) => {
        const percent = defaultBenefitPercent(s.benefit, tier);
        return percent === null ? [] : [{ serviceId: s.id, tier, percent }];
      })
    );
    await this.prisma.benefitDiscount.createMany({ data: discounts });
  }
}
