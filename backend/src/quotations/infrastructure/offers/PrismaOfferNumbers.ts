import { PrismaClient } from '@prisma/client';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { IOfferNumbers } from '../../application/offers/ports/IOfferNumbers';
import { formatOfferNumber } from '../../domain/quotationReference';

/** The kind of document the offer numbers count (D5). */
export const OFFER_SEQUENCE = 'OFFER';

/**
 * Offer numbers from DocumentSequence (D5, FR-OFR-08), on the client it is
 * given, which is the caller's transaction. The year's row is created if it
 * is missing (`skipDuplicates`: ON CONFLICT DO NOTHING on Postgres, INSERT
 * IGNORE on MySQL, so two first offers of a year cannot collide), then
 * incremented. The increment takes the row's lock until the transaction
 * ends, so a second create waits and gets the next number, and a create that
 * fails rolls its increment back.
 */
export class PrismaOfferNumbers implements IOfferNumbers {
  constructor(private readonly prisma: PrismaClient) {}

  async next(tenantId: string, now: Date): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true, pricingSettings: { select: { offerNumberPrefix: true } } },
    });
    const year = Number(dayKeyInZone(now, tenant?.timezone ?? 'UTC').slice(0, 4));
    const key = { tenantId, kind: OFFER_SEQUENCE, year };
    await this.prisma.documentSequence.createMany({ data: [{ ...key, next: 1 }], skipDuplicates: true });
    const row = await this.prisma.documentSequence.update({
      where: { tenantId_kind_year: key },
      data: { next: { increment: 1 } },
    });
    return formatOfferNumber(tenant?.pricingSettings?.offerNumberPrefix ?? 'OF', year, row.next - 1);
  }
}

/** Offer numbers for a caller with no transaction of its own (the legacy quotation create). */
export class StandaloneOfferNumbers implements IOfferNumbers {
  constructor(private readonly prisma: PrismaClient) {}

  next(tenantId: string, now: Date): Promise<string> {
    return this.prisma.$transaction((tx) => new PrismaOfferNumbers(tx as unknown as PrismaClient).next(tenantId, now));
  }
}
