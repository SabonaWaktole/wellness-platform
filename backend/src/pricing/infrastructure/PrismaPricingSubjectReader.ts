import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { DealStage, isOpenStage } from '../../deals/domain/DealStage';
import { IPricingSubjectReader, PricingSubject } from '../application/ports/IPricingSubjectReader';

const label = { select: { id: true, nameSq: true, nameEn: true } } as const;

const COMPANY_SELECT = {
  id: true,
  name: true,
  assignedUserId: true,
  employeeCount: true,
  businessTypeId: true,
  deletedAt: true,
  city: { select: { id: true, nameSq: true, nameEn: true, area: label } },
} satisfies Prisma.ClientSelect;

type CompanyRow = Prisma.ClientGetPayload<{ select: typeof COMPANY_SELECT }>;

function toSubject(company: CompanyRow, deal: PricingSubject['deal']): PricingSubject {
  const city = company.city;
  return {
    clientId: company.id,
    companyName: company.name ?? '',
    companyAssigneeId: company.assignedUserId,
    deal,
    employeeCount: company.employeeCount,
    businessTypeId: company.businessTypeId,
    city: city ? { id: city.id, nameSq: city.nameSq, nameEn: city.nameEn } : null,
    // The location is the city's: the area shown is the one the city is in.
    area: city ? { id: city.area.id, nameSq: city.area.nameSq, nameEn: city.area.nameEn } : null,
  };
}

export class PrismaPricingSubjectReader implements IPricingSubjectReader {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async forCompany(tenantId: string, clientId: string): Promise<PricingSubject | null> {
    const company = await this.prisma.client.findFirst({ where: { id: clientId, tenantId, deletedAt: null }, select: COMPANY_SELECT });
    return company ? toSubject(company, null) : null;
  }

  async forDeal(tenantId: string, dealId: string): Promise<PricingSubject | null> {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId, deletedAt: null },
      select: { id: true, ownerUserId: true, stageKey: true, client: { select: COMPANY_SELECT } },
    });
    if (!deal || deal.client.deletedAt) return null;
    return toSubject(deal.client, { id: deal.id, ownerUserId: deal.ownerUserId, open: isOpenStage(deal.stageKey as DealStage) });
  }
}
