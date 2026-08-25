import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { IInvoicePdfReader, InvoicePdfView } from '../application/GetInvoicePdfViewUseCase';
import { invoiceReference } from '../domain/invoiceReference';

export class PrismaInvoicePdfReader implements IInvoicePdfReader {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async findByInvoiceId(tenantId: string, invoiceId: string): Promise<InvoicePdfView | null> {
    const row = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: { select: { name: true } },
        tenant: {
          select: {
            name: true,
            currency: true,
            locale: true,
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

    if (!row || row.tenantId !== tenantId) return null;

    const lines = row.lineItems.map((li) => ({
      description: li.product.name,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      lineTotal: li.quantity * li.unitPrice,
    }));

    return {
      reference: invoiceReference(row.id),
      status: row.status,
      issuedAt: row.createdAt,
      dueDate: row.dueDate,
      sentAt: row.sentAt,
      paidAt: row.paidAt,
      // Falls back to "Client" if the tenant deleted the field currently
      // holding the PRIMARY_NAME role — see ClientFieldResolver.
      clientName: row.client.name ?? 'Client',
      companyName: row.tenant.name,
      companyAddress: formatAddress(row.tenant),
      companyContactEmail: row.tenant.contactEmail,
      companyContactPhone: row.tenant.contactPhone,
      currency: row.tenant.currency,
      locale: row.tenant.locale,
      lines,
      subtotal: lines.reduce((sum, l) => sum + l.lineTotal, 0),
    };
  }
}

/** Same helper as `PrismaPublicQuotationReader.formatAddress` — every part is optional. */
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
