import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { IPublicQuotationReader, PublicQuotationView } from '../application/GetPublicQuotationUseCase';
import { quotationReference } from '../domain/quotationReference';

export class PrismaPublicQuotationReader implements IPublicQuotationReader {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async findByShareToken(token: string): Promise<PublicQuotationView | null> {
    const row = await this.prisma.quotation.findUnique({
      where: { shareToken: token },
      include: {
        client: { select: { name: true, email: true } },
        tenant: {
          select: {
            name: true,
            logoUrl: true,
            currency: true,
            locale: true,
            dateFormat: true,
            addressLine: true,
            addressCity: true,
            addressState: true,
            addressPostalCode: true,
            contactEmail: true,
            contactPhone: true,
          },
        },
        lineItems: {
          include: { product: { select: { name: true } } },
        },
      },
    });

    if (!row) return null;

    const lines = row.lineItems.map((li) => ({
      // The product NAME, resolved now rather than a stored snapshot. A
      // customer opening the link should see the catalogue as it stands; if a
      // product is renamed, the old name would be a mystery to both sides.
      description: li.product.name,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      lineTotal: li.quantity * li.unitPrice,
    }));

    return {
      quotationId: row.id,
      tenantId: row.tenantId,
      reference: quotationReference(row.id),
      status: row.status,
      issuedAt: row.createdAt,
      sentAt: row.sentAt,
      respondedAt: row.respondedAt,
      // Falls back to "Client" if the tenant deleted the field currently
      // holding the PRIMARY_NAME role — see ClientFieldResolver.
      clientName: row.client.name ?? 'Client',
      clientEmail: row.client.email,
      companyName: row.tenant.name,
      companyLogoUrl: row.tenant.logoUrl,
      companyAddress: formatAddress(row.tenant),
      companyContactEmail: row.tenant.contactEmail,
      companyContactPhone: row.tenant.contactPhone,
      currency: row.tenant.currency,
      locale: row.tenant.locale,
      dateFormat: row.tenant.dateFormat,
      lines,
      subtotal: lines.reduce((sum, l) => sum + l.lineTotal, 0),
    };
  }
}

/**
 * Joins the address parts a tenant has actually filled in.
 *
 * Every part is optional, so a naive template would produce ", , " for a
 * workspace that set only a city — on a document its own customer reads.
 */
function formatAddress(tenant: {
  addressLine: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostalCode: string | null;
}): string | null {
  const parts = [
    tenant.addressLine,
    tenant.addressCity,
    tenant.addressState,
    tenant.addressPostalCode,
  ].filter((p): p is string => Boolean(p && p.trim()));

  return parts.length > 0 ? parts.join(', ') : null;
}
