import { PrismaClient } from '@prisma/client';
import { IQuotationRepository, QuotationFilters, PaginatedQuotations } from '../../domain/IQuotationRepository';
import { Quotation, QuotationStatus } from '../../domain/Quotation';
import { QuotationLineItem } from '../../domain/QuotationLineItem';
import { insensitiveContains } from '../../../shared/infrastructure/prisma/caseInsensitiveFilter';

export class PrismaQuotationRepository implements IQuotationRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(tenantId: string, id: string): Promise<Quotation | null> {
    const raw = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        lineItems: true,
        client: { select: { name: true } }
      }
    });

    if (!raw || raw.tenantId !== tenantId) {
      return null;
    }

    const lineItems = raw.lineItems.map(li => QuotationLineItem.create({
      id: li.id,
      tenantId: li.tenantId,
      quotationId: li.quotationId,
      productId: li.productId,
      warehouseId: li.warehouseId,
      quantity: li.quantity,
      unitPrice: li.unitPrice
    }));

    return Quotation.create({
      id: raw.id,
      tenantId: raw.tenantId,
      clientId: raw.clientId,
      clientName: raw.client?.name,
      createdByUserId: raw.createdByUserId,
      status: raw.status as QuotationStatus,
      createdAt: raw.createdAt,
      sentAt: raw.sentAt,
      respondedAt: raw.respondedAt,
      shareToken: raw.shareToken,
      shareTokenIssuedAt: raw.shareTokenIssuedAt,
      lineItems
    });
  }

  async findPendingApprovals(tenantId: string): Promise<Quotation[]> {
    const rawQuotations = await this.prisma.quotation.findMany({
      where: {
        tenantId,
        status: QuotationStatus.PendingApproval
      },
      include: {
        lineItems: true,
        client: { select: { name: true } }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return rawQuotations.map(raw => {
      const lineItems = raw.lineItems.map(li => QuotationLineItem.create({
        id: li.id,
        tenantId: li.tenantId,
        quotationId: li.quotationId,
        productId: li.productId,
        warehouseId: li.warehouseId,
        quantity: li.quantity,
        unitPrice: li.unitPrice
      }));

      return Quotation.create({
        id: raw.id,
        tenantId: raw.tenantId,
        clientId: raw.clientId,
        clientName: raw.client?.name,
        createdByUserId: raw.createdByUserId,
        status: raw.status as QuotationStatus,
        createdAt: raw.createdAt,
        sentAt: raw.sentAt,
        respondedAt: raw.respondedAt,
        shareToken: raw.shareToken,
        shareTokenIssuedAt: raw.shareTokenIssuedAt,
        lineItems
      });
    });
  }

  async search(filters: QuotationFilters): Promise<PaginatedQuotations> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      tenantId: filters.tenantId,
    };

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.clientId) {
      where.clientId = filters.clientId;
    }
    if (filters.createdByUserId) {
      where.createdByUserId = filters.createdByUserId;
    }
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    // Handle query for full text search if needed (e.g. searching client name, or quotation ID)
    // For now we'll do basic ID match if query is provided, or we could join Client to search by name.
    // Given the schema, joining Client to search by name is common.
    if (filters.query) {
      where.OR = [
        { id: insensitiveContains(filters.query) },
        { client: { name: insensitiveContains(filters.query) } }
      ];
    }

    const [total, rawQuotations] = await this.prisma.$transaction([
      this.prisma.quotation.count({ where }),
      this.prisma.quotation.findMany({
        where,
        include: {
          lineItems: true,
          client: { select: { name: true } }
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc'
        }
      })
    ]);

    const data = rawQuotations.map(raw => {
      const lineItems = raw.lineItems.map(li => QuotationLineItem.create({
        id: li.id,
        tenantId: li.tenantId,
        quotationId: li.quotationId,
        productId: li.productId,
        warehouseId: li.warehouseId,
        quantity: li.quantity,
        unitPrice: li.unitPrice
      }));

      return Quotation.create({
        id: raw.id,
        tenantId: raw.tenantId,
        clientId: raw.clientId,
        clientName: raw.client?.name,
        createdByUserId: raw.createdByUserId,
        status: raw.status as QuotationStatus,
        createdAt: raw.createdAt,
        sentAt: raw.sentAt,
        respondedAt: raw.respondedAt,
        shareToken: raw.shareToken,
        shareTokenIssuedAt: raw.shareTokenIssuedAt,
        lineItems
      });
    });

    return { data, total };
  }

  async save(quotation: Quotation): Promise<void> {
    await this.prisma.quotation.upsert({
      where: { id: quotation.id },
      update: {
        status: quotation.status,
        sentAt: quotation.sentAt,
        respondedAt: quotation.respondedAt,
        // The share token is written here rather than by a dedicated method so
        // it lands in the same statement as the SENT status that justifies it.
        // The entity refuses to reissue, so an update can only ever set it from
        // NULL to a value — never overwrite a link a customer already holds.
        shareToken: quotation.shareToken,
        shareTokenIssuedAt: quotation.shareTokenIssuedAt,
        // Other fields shouldn't change
      },
      create: {
        id: quotation.id,
        tenantId: quotation.tenantId,
        clientId: quotation.clientId,
        createdByUserId: quotation.createdByUserId,
        status: quotation.status,
        sentAt: quotation.sentAt,
        respondedAt: quotation.respondedAt,
        shareToken: quotation.shareToken,
        shareTokenIssuedAt: quotation.shareTokenIssuedAt
      }
    });
  }
}
