import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';
import { OfferView } from '../../application/offers/offerViews';
import { IOfferStore } from '../../application/offers/ports/IOfferStore';
import { OFFER_INCLUDE, toOfferView } from './prismaOfferRows';

export class PrismaOfferStore implements IOfferStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async forDeal(tenantId: string, dealId: string): Promise<OfferView[]> {
    const rows = await this.prisma.quotation.findMany({
      where: { tenantId, dealId },
      include: OFFER_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toOfferView);
  }

  async find(tenantId: string, id: string): Promise<OfferView | null> {
    const row = await this.prisma.quotation.findFirst({ where: { id, tenantId, dealId: { not: null } }, include: OFFER_INCLUDE });
    return row ? toOfferView(row) : null;
  }
}
