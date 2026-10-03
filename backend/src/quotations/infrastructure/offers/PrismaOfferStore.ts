import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';
import { insensitiveContains } from '../../../shared/infrastructure/prisma/caseInsensitiveFilter';
import { RecordScope } from '../../../access/domain/RecordScope';
import { ownerWhere } from '../../../access/infrastructure/prismaRecordScope';
import { OfferRenderSnapshot } from '../../application/offers/document/OfferRenderSnapshot';
import { OfferPage, OfferView } from '../../application/offers/offerViews';
import { IOfferStore, OfferFilters } from '../../application/offers/ports/IOfferStore';
import { OFFER_INCLUDE, toOfferView } from './prismaOfferRows';

const NEWEST_FIRST: Prisma.QuotationOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];

/** YYYY-MM-DD plus one day, for an inclusive "to" date. */
const nextDay = (day: string) => {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
};

export class PrismaOfferStore implements IOfferStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async forDeal(tenantId: string, dealId: string): Promise<OfferView[]> {
    const rows = await this.prisma.quotation.findMany({ where: { tenantId, dealId }, include: OFFER_INCLUDE, orderBy: NEWEST_FIRST });
    return rows.map(toOfferView);
  }

  async find(tenantId: string, id: string): Promise<OfferView | null> {
    const row = await this.prisma.quotation.findFirst({ where: { id, tenantId, dealId: { not: null } }, include: OFFER_INCLUDE });
    return row ? toOfferView(row) : null;
  }

  async frozenDetails(tenantId: string, id: string): Promise<OfferRenderSnapshot | null> {
    const row = await this.prisma.quotation.findFirst({ where: { id, tenantId }, select: { renderSnapshot: true } });
    const snapshot = row?.renderSnapshot;
    return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? (snapshot as unknown as OfferRenderSnapshot) : null;
  }

  async list(tenantId: string, scope: RecordScope, filters: OfferFilters, page: number, pageSize: number): Promise<OfferPage> {
    const and: Prisma.QuotationWhereInput[] = [
      { tenantId, dealId: { not: null } },
      // FR-OFR-14: the deal's salesperson decides who sees the offer; a deleted deal's offers leave the list.
      { deal: { deletedAt: null, ...ownerWhere(scope, 'ownerUserId', { nullable: false }) } },
    ];
    if (filters.statuses?.length) and.push({ status: { in: filters.statuses } });
    if (filters.ownerUserId) and.push({ deal: { ownerUserId: filters.ownerUserId } });
    if (filters.clientId) and.push({ clientId: filters.clientId });
    if (filters.query) {
      and.push({ OR: [{ client: { name: insensitiveContains(filters.query) } }, { number: insensitiveContains(filters.query) }] });
    }
    if (filters.createdFrom) and.push({ createdAt: { gte: new Date(`${filters.createdFrom}T00:00:00.000Z`) } });
    if (filters.createdTo) and.push({ createdAt: { lt: nextDay(filters.createdTo) } });

    const where: Prisma.QuotationWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.quotation.findMany({ where, include: OFFER_INCLUDE, orderBy: NEWEST_FIRST, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.quotation.count({ where }),
    ]);
    return { data: rows.map(toOfferView), total, page, pageSize };
  }
}
