import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { Offer, OfferLanguage, OfferProps } from '../../domain/Offer';
import { IOfferWrites } from '../../application/offers/ports/IOfferWriteTransaction';
import { amountColumns, OFFER_INCLUDE, toOffer } from './prismaOfferRows';

/** The columns a draft's content writes; the identity columns are written once, on insert. */
function contentColumns(props: OfferProps) {
  return {
    status: props.status,
    language: props.language,
    note: props.note,
    employeesPriced: props.employeesPriced,
    packageId: props.packageId,
    frequencyId: props.frequencyId,
    zoneId: props.zoneId,
    pricingInputs: props.pricingInputs as Prisma.InputJsonObject,
    ruleSnapshot: props.ruleSnapshot as Prisma.InputJsonObject,
    ...amountColumns(props.amounts),
    updatedAt: props.updatedAt,
  };
}

const serviceRows = (props: OfferProps) =>
  props.services.map((service, order) => ({ id: randomUUID(), tenantId: props.tenantId, quotationId: props.id, order, ...service }));

export class PrismaOfferWrites implements IOfferWrites {
  constructor(private readonly prisma: PrismaClient) {}

  async currentDraft(tenantId: string, dealId: string): Promise<Offer | null> {
    const row = await this.prisma.quotation.findFirst({
      where: { tenantId, dealId, status: 'DRAFT' },
      include: OFFER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return row ? toOffer(row) : null;
  }

  countForDeal(tenantId: string, dealId: string): Promise<number> {
    return this.prisma.quotation.count({ where: { tenantId, dealId } });
  }

  async insert(offer: Offer): Promise<void> {
    const props = offer.toProps();
    await this.prisma.quotation.create({
      data: {
        ...contentColumns(props),
        id: props.id,
        tenantId: props.tenantId,
        clientId: props.clientId,
        dealId: props.dealId,
        createdByUserId: props.createdByUserId,
        createdAt: props.createdAt,
      },
    });
    await this.prisma.quotationService.createMany({ data: serviceRows(props) });
    // As the legacy create does: the first history row has no previous status.
    await this.prisma.quotationStatusHistory.create({
      data: { tenantId: props.tenantId, quotationId: props.id, fromStatus: 'NONE', toStatus: props.status, changedByUserId: props.createdByUserId },
    });
  }

  async update(offer: Offer): Promise<void> {
    const props = offer.toProps();
    await this.prisma.quotation.updateMany({ where: { id: props.id, tenantId: props.tenantId }, data: contentColumns(props) });
    await this.prisma.quotationService.deleteMany({ where: { tenantId: props.tenantId, quotationId: props.id } });
    await this.prisma.quotationService.createMany({ data: serviceRows(props) });
  }

  async workspaceLanguage(tenantId: string): Promise<OfferLanguage> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { defaultLanguage: true } });
    return tenant?.defaultLanguage === 'en' ? 'en' : 'sq';
  }

  async setCompanyEmployees(
    tenantId: string,
    clientId: string,
    employees: number,
    userId: string
  ): Promise<{ previous: number | null; companyName: string } | null> {
    const company = await this.prisma.client.findFirst({ where: { id: clientId, tenantId }, select: { employeeCount: true, name: true } });
    if (!company) return null;
    await this.prisma.client.updateMany({
      where: { id: clientId, tenantId },
      data: { employeeCount: employees, lastUpdatedByUserId: userId },
    });
    return { previous: company.employeeCount, companyName: company.name ?? '' };
  }
}
