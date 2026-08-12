import { PrismaClient } from '@prisma/client';
import { IInvoiceRepository, InvoiceFilters, PaginatedInvoices } from '../../domain/IInvoiceRepository';
import { Invoice, InvoiceStatus } from '../../domain/Invoice';
import { InvoiceLineItem } from '../../domain/InvoiceLineItem';
import { insensitiveContains } from '../../../shared/infrastructure/prisma/caseInsensitiveFilter';

export class PrismaInvoiceRepository implements IInvoiceRepository {
  constructor(private prisma: PrismaClient) {}

  private toDomain(raw: any): Invoice {
    const lineItems = raw.lineItems.map((li: any) =>
      InvoiceLineItem.create({
        id: li.id,
        tenantId: li.tenantId,
        invoiceId: li.invoiceId,
        productId: li.productId,
        warehouseId: li.warehouseId,
        quantity: li.quantity,
        unitPrice: li.unitPrice
      })
    );

    return Invoice.create({
      id: raw.id,
      tenantId: raw.tenantId,
      clientId: raw.clientId,
      clientName: raw.client?.name,
      quotationId: raw.quotationId,
      createdByUserId: raw.createdByUserId,
      status: raw.status as InvoiceStatus,
      dueDate: raw.dueDate,
      createdAt: raw.createdAt,
      sentAt: raw.sentAt,
      paidAt: raw.paidAt,
      lineItems
    });
  }

  async findById(tenantId: string, id: string): Promise<Invoice | null> {
    const raw = await this.prisma.invoice.findUnique({
      where: { id },
      include: { lineItems: true, client: { select: { name: true } } }
    });

    if (!raw || raw.tenantId !== tenantId) {
      return null;
    }

    return this.toDomain(raw);
  }

  async findByQuotationId(tenantId: string, quotationId: string): Promise<Invoice | null> {
    const raw = await this.prisma.invoice.findUnique({
      where: { quotationId },
      include: { lineItems: true, client: { select: { name: true } } }
    });

    if (!raw || raw.tenantId !== tenantId) {
      return null;
    }

    return this.toDomain(raw);
  }

  async search(filters: InvoiceFilters): Promise<PaginatedInvoices> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = { tenantId: filters.tenantId };

    if (filters.status) where.status = filters.status;
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.query) {
      where.OR = [
        { id: insensitiveContains(filters.query) },
        { client: { name: insensitiveContains(filters.query) } }
      ];
    }

    const [total, rawInvoices] = await this.prisma.$transaction([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: { lineItems: true, client: { select: { name: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return { data: rawInvoices.map((raw) => this.toDomain(raw)), total };
  }

  async save(invoice: Invoice): Promise<void> {
    await this.prisma.invoice.upsert({
      where: { id: invoice.id },
      update: {
        status: invoice.status,
        dueDate: invoice.dueDate,
        sentAt: invoice.sentAt,
        paidAt: invoice.paidAt
      },
      create: {
        id: invoice.id,
        tenantId: invoice.tenantId,
        clientId: invoice.clientId,
        quotationId: invoice.quotationId,
        createdByUserId: invoice.createdByUserId,
        status: invoice.status,
        dueDate: invoice.dueDate,
        sentAt: invoice.sentAt,
        paidAt: invoice.paidAt
      }
    });
  }
}
