import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';
import { RichTextDoc } from '../../../shared/domain/richText';
import { OfferRenderSnapshot, RENDER_SNAPSHOT_VERSION } from '../../application/offers/document/OfferRenderSnapshot';
import { IOfferDocumentSource, OfferDocumentSubject } from '../../application/offers/ports/IOfferDocumentSource';

const doc = (value: unknown): RichTextDoc | null =>
  value && typeof value === 'object' && (value as { type?: unknown }).type === 'doc' ? (value as RichTextDoc) : null;

const label = (row: { nameSq: string; nameEn: string | null } | null) => (row ? { nameSq: row.nameSq, nameEn: row.nameEn } : null);

/**
 * The details an offer's PDF shows, read now (D2): Wellness Albania's
 * details and texts from the offer settings (FR-PCF-08), the company with its
 * area and city labels, the chosen contact or the primary one, and the deal's
 * salesperson (FR-OFR-02). Deleted contacts are skipped.
 */
export class PrismaOfferDocumentSource implements IOfferDocumentSource {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async current(tenantId: string, subject: OfferDocumentSubject): Promise<OfferRenderSnapshot> {
    const [settings, company, chosen, salesperson] = await Promise.all([
      this.prisma.pricingSettings.findUnique({ where: { tenantId } }),
      this.prisma.client.findFirst({
        where: { id: subject.clientId, tenantId },
        select: {
          name: true,
          taxId: true,
          streetAddress: true,
          area: { select: { nameSq: true, nameEn: true } },
          city: { select: { nameSq: true, nameEn: true } },
        },
      }),
      subject.contactPersonId
        ? this.prisma.contactPerson.findFirst({ where: { id: subject.contactPersonId, tenantId, clientId: subject.clientId, deletedAt: null } })
        : null,
      this.prisma.user.findFirst({
        where: { id: subject.salespersonUserId, tenantId },
        select: { firstName: true, lastName: true, email: true, phone: true },
      }),
    ]);
    const contact =
      chosen ??
      (await this.prisma.contactPerson.findFirst({
        where: { tenantId, clientId: subject.clientId, deletedAt: null },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      }));

    return {
      schemaVersion: RENDER_SNAPSHOT_VERSION,
      issuer: {
        companyName: settings?.companyName ?? null,
        nipt: settings?.nipt ?? null,
        address: settings?.address ?? null,
        phone: settings?.phone ?? null,
        email: settings?.email ?? null,
        website: settings?.website ?? null,
        bankDetails: settings?.bankDetails ?? null,
      },
      texts: {
        introSq: doc(settings?.introSq),
        introEn: doc(settings?.introEn),
        termsSq: doc(settings?.termsSq),
        termsEn: doc(settings?.termsEn),
        closingSq: doc(settings?.closingSq),
        closingEn: doc(settings?.closingEn),
      },
      company: {
        name: company?.name ?? '',
        nipt: company?.taxId ?? null,
        streetAddress: company?.streetAddress ?? null,
        area: label(company?.area ?? null),
        city: label(company?.city ?? null),
      },
      contact: contact ? { name: contact.name, position: contact.position, phone: contact.phone, email: contact.email } : null,
      salesperson: {
        name: salesperson ? [salesperson.firstName, salesperson.lastName].filter(Boolean).join(' ') || salesperson.email : '',
        phone: salesperson?.phone ?? null,
        email: salesperson?.email ?? '',
      },
    };
  }
}
