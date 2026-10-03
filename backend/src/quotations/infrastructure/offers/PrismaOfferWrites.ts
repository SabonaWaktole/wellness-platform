import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { Offer, OfferLanguage, OfferProps } from '../../domain/Offer';
import { IOfferWrites, OfferStatusChange } from '../../application/offers/ports/IOfferWriteTransaction';
import { amountColumns, OFFER_INCLUDE, statusColumns, toOffer } from './prismaOfferRows';

/** The columns a draft's content writes; the identity columns are written once, on insert. */
function contentColumns(props: OfferProps) {
  return {
    language: props.language,
    note: props.note,
    employeesPriced: props.employeesPriced,
    packageId: props.packageId,
    frequencyId: props.frequencyId,
    zoneId: props.zoneId,
    contactPersonId: props.contactPersonId,
    pricingInputs: props.pricingInputs as Prisma.InputJsonObject,
    ruleSnapshot: props.ruleSnapshot as Prisma.InputJsonObject,
    ...amountColumns(props.amounts),
    ...statusColumns(props),
  };
}

const serviceRows = (props: OfferProps) =>
  props.services.map((service, order) => ({ id: randomUUID(), tenantId: props.tenantId, quotationId: props.id, order, ...service }));

/** Offers only: a quotation with a deal (FR-OFR-01). */
const OFFER = { dealId: { not: null } } as const;

export class PrismaOfferWrites implements IOfferWrites {
  constructor(private readonly prisma: PrismaClient) {}

  async find(tenantId: string, id: string): Promise<Offer | null> {
    const row = await this.prisma.quotation.findFirst({ where: { id, tenantId, ...OFFER }, include: OFFER_INCLUDE });
    return row ? toOffer(row) : null;
  }

  async latest(tenantId: string, dealId: string): Promise<Offer | null> {
    const row = await this.prisma.quotation.findFirst({
      where: { tenantId, dealId, supersededAt: null },
      include: OFFER_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
        number: props.number,
        version: props.version,
        previousVersionId: props.previousVersionId,
        createdAt: props.createdAt,
      },
    });
    await this.prisma.quotationService.createMany({ data: serviceRows(props) });
    // As the legacy create does: the first history row has no previous status.
    await this.recordStatusChange({
      tenantId: props.tenantId,
      offerId: props.id,
      fromStatus: 'NONE',
      toStatus: props.status,
      userId: props.createdByUserId,
      note: null,
    });
  }

  async update(offer: Offer): Promise<void> {
    const props = offer.toProps();
    await this.prisma.quotation.updateMany({ where: { id: props.id, tenantId: props.tenantId }, data: contentColumns(props) });
    await this.prisma.quotationService.deleteMany({ where: { tenantId: props.tenantId, quotationId: props.id } });
    await this.prisma.quotationService.createMany({ data: serviceRows(props) });
  }

  async saveStatus(offer: Offer): Promise<void> {
    const props = offer.toProps();
    await this.prisma.quotation.updateMany({ where: { id: props.id, tenantId: props.tenantId }, data: statusColumns(props) });
  }

  async recordStatusChange(change: OfferStatusChange): Promise<void> {
    await this.prisma.quotationStatusHistory.create({
      data: {
        tenantId: change.tenantId,
        quotationId: change.offerId,
        fromStatus: change.fromStatus,
        toStatus: change.toStatus,
        changedByUserId: change.userId,
        note: change.note,
      },
    });
  }

  async timeZone(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
    return tenant?.timezone ?? 'UTC';
  }

  async isContactOf(tenantId: string, clientId: string, contactPersonId: string): Promise<boolean> {
    return (await this.prisma.contactPerson.count({ where: { id: contactPersonId, tenantId, clientId, deletedAt: null } })) > 0;
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
