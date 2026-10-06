import { PrismaClient } from '@prisma/client';
import { Money } from '../../pricing/domain/Money';
import { IContractDealSource, DealForContract } from '../application/ports/IContractDealSource';
import { ContractServiceLine, ContractTerms } from '../domain/Contract';

const asDoc = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

/**
 * Reads a deal and the offer that won it, as the contract is filled from them
 * (FR-CON-03). The price comes from the deal's agreed values, which the win
 * copied from the offer (M2 FR-DEAL-14); the services are the offer's copy,
 * so they read the same after the package changes; the terms are the offer's
 * frozen texts, or the workspace's current ones for an offer that was never
 * made Ready.
 */
export class PrismaContractDealSource implements IContractDealSource {
  constructor(private readonly prisma: PrismaClient) {}

  async find(tenantId: string, dealId: string): Promise<DealForContract | null> {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId, deletedAt: null },
      include: {
        client: { select: { assignedUserId: true, deletedAt: true } },
        package: { select: { nameSq: true } },
        wonQuotation: { include: { services: { orderBy: { order: 'asc' } } } },
      },
    });
    if (!deal) return null;

    const offer = deal.wonQuotation;
    const base = {
      dealId: deal.id,
      clientId: deal.clientId,
      clientActive: deal.client.deletedAt === null,
      clientAssignedUserId: deal.client.assignedUserId,
      ownerUserId: deal.ownerUserId,
      type: deal.type,
      stageKey: deal.stageKey,
      renewalOfContractId: deal.renewalOfContractId,
      closedAt: deal.closedAt,
      packageName: deal.package?.nameSq ?? null,
    };
    if (!offer || !deal.agreedMonthlyPrice || !deal.agreedAnnualValue) {
      return { ...base, source: null, contractMonths: 12 };
    }

    const settings = await this.prisma.pricingSettings.findUnique({ where: { tenantId } });
    const texts = (asDoc(offer.renderSnapshot)?.texts ?? null) as Record<string, unknown> | null;
    const sq = asDoc(texts?.termsSq) ?? asDoc(settings?.termsSq);
    const en = asDoc(texts?.termsEn) ?? asDoc(settings?.termsEn);
    const termsText: ContractTerms | null = sq || en ? { sq, en } : null;

    const services: ContractServiceLine[] = offer.services.map((service) => ({
      nameSq: service.nameSq,
      nameEn: service.nameEn,
      descriptionSq: service.descriptionSq,
      descriptionEn: service.descriptionEn,
    }));

    const months = Number(asDoc(offer.ruleSnapshot)?.contractMonths ?? 12);
    return {
      ...base,
      contractMonths: Number.isInteger(months) && months >= 1 ? months : 12,
      source: {
        dealId: deal.id,
        quotationId: offer.id,
        packageId: deal.packageId ?? offer.packageId,
        servicesSnapshot: services,
        termsText,
        amount: Money.of(String(deal.agreedMonthlyPrice)).toString(),
        agreedAnnualValue: Money.of(String(deal.agreedAnnualValue)).toString(),
        discountPercent: offer.discountPercent === null ? null : offer.discountPercent.toFixed(2),
      },
    };
  }
}
