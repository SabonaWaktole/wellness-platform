import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import type { BenefitServiceRecord, IBenefitStore } from '../application/ports/IMembershipSettingsStore';
import type { TierDiscounts } from '../domain/BenefitTable';
import { TIERS } from '../domain/Tier';

type Row = {
  id: string;
  nameSq: string;
  nameEn: string;
  order: number;
  active: boolean;
  discounts: Array<{ tier: string; percent: { toString(): string } }>;
};

const toRecord = (row: Row): BenefitServiceRecord => {
  const discounts = { BRONZE: null, SILVER: null, GOLD: null, VIP: null } as BenefitServiceRecord['discounts'];
  for (const d of row.discounts) {
    if ((TIERS as readonly string[]).includes(d.tier)) discounts[d.tier as keyof typeof discounts] = Number(d.percent.toString()).toFixed(2);
  }
  return { id: row.id, nameSq: row.nameSq, nameEn: row.nameEn, order: row.order, active: row.active, discounts };
};

export class PrismaBenefitStore implements IBenefitStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async list(tenantId: string): Promise<BenefitServiceRecord[]> {
    const rows = await this.prisma.benefitService.findMany({
      where: { tenantId },
      include: { discounts: true },
      orderBy: [{ order: 'asc' }, { nameEn: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async find(tenantId: string, id: string): Promise<BenefitServiceRecord | null> {
    const row = await this.prisma.benefitService.findFirst({ where: { id, tenantId }, include: { discounts: true } });
    return row ? toRecord(row) : null;
  }

  async create(tenantId: string, values: Omit<BenefitServiceRecord, 'id'>): Promise<BenefitServiceRecord> {
    const id = randomUUID();
    await this.prisma.benefitService.create({
      data: { id, tenantId, nameSq: values.nameSq, nameEn: values.nameEn, order: values.order, active: values.active },
    });
    await this.writeDiscounts(id, values.discounts);
    return { id, ...values };
  }

  async update(tenantId: string, record: BenefitServiceRecord, changedDiscounts: TierDiscounts): Promise<void> {
    await this.prisma.benefitService.updateMany({
      where: { id: record.id, tenantId },
      data: { nameSq: record.nameSq, nameEn: record.nameEn, order: record.order, active: record.active },
    });
    await this.writeDiscounts(record.id, changedDiscounts);
  }

  /** A null percent removes the row: no row is no discount. */
  private async writeDiscounts(serviceId: string, discounts: TierDiscounts): Promise<void> {
    for (const tier of TIERS) {
      if (!(tier in discounts)) continue;
      const percent = discounts[tier];
      if (percent === null || percent === undefined) {
        await this.prisma.benefitDiscount.deleteMany({ where: { serviceId, tier } });
      } else {
        await this.prisma.benefitDiscount.upsert({
          where: { serviceId_tier: { serviceId, tier } },
          create: { serviceId, tier, percent },
          update: { percent },
        });
      }
    }
  }
}
