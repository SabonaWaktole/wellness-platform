import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { RecordScope } from '../../access/domain/RecordScope';
import { ownerWhere } from '../../access/infrastructure/prismaRecordScope';
import { quotationReference } from '../../quotations/domain/quotationReference';
import { IDiscountApprovalStore } from '../application/ports/IDiscountApprovalStore';
import { PendingApprovalView } from '../application/ports/IDiscountApprovalWrites';
import { DiscountApproval } from '../domain/DiscountApproval';
import { approvalColumns, toDiscountApproval } from './prismaDiscountApprovalRows';

const LIST_INCLUDE = {
  quotation: {
    select: {
      id: true,
      dealId: true,
      number: true,
      version: true,
      client: { select: { name: true } },
      deal: {
        select: {
          title: true,
          ownerUserId: true,
          owner: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  },
  requestedBy: { select: { firstName: true, lastName: true, email: true } },
} satisfies Prisma.DiscountApprovalInclude;

type PendingRow = Prisma.DiscountApprovalGetPayload<{ include: typeof LIST_INCLUDE }>;

const personName = (person: { firstName: string | null; lastName: string | null; email: string }) =>
  [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email;

function toPendingView(row: PendingRow): PendingApprovalView {
  const offer = row.quotation;
  return {
    id: row.id,
    offerId: row.quotationId,
    dealId: offer.dealId!,
    companyName: offer.client.name ?? '',
    dealTitle: offer.deal?.title ?? null,
    reference: quotationReference({ id: row.quotationId, number: offer.number, version: offer.version }),
    dealOwnerUserId: offer.deal?.ownerUserId ?? '',
    dealOwnerName: offer.deal ? personName(offer.deal.owner) : '',
    requestedByUserId: row.requestedByUserId,
    requestedByName: personName(row.requestedBy),
    requestedPercent: row.requestedPercent.toFixed(2),
    listPriceAtRequest: row.listPriceAtRequest.toFixed(2),
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Reads of discount approvals. The pending list is scoped on the deal's
 * salesperson through the offer's deal (FR-DSC-06, FR-RBAC-13).
 */
export class PrismaDiscountApprovalStore implements IDiscountApprovalStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async find(tenantId: string, id: string): Promise<DiscountApproval | null> {
    const row = await this.prisma.discountApproval.findFirst({ where: { id, tenantId } });
    return row ? toDiscountApproval(row) : null;
  }

  async pendingForOffer(tenantId: string, quotationId: string): Promise<DiscountApproval[]> {
    const rows = await this.prisma.discountApproval.findMany({
      where: { tenantId, quotationId, status: 'PENDING' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toDiscountApproval);
  }

  /** Pending requests whose deal is inside `scope`, oldest first (FR-DSC-06). */
  async listPending(
    tenantId: string,
    scope: RecordScope,
    page: number,
    pageSize: number
  ): Promise<{ data: PendingApprovalView[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.DiscountApprovalWhereInput = {
      tenantId,
      status: 'PENDING',
      quotation: { deal: { deletedAt: null, ...ownerWhere(scope, 'ownerUserId', { nullable: false }) } },
    };
    const [rows, total] = await Promise.all([
      this.prisma.discountApproval.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.discountApproval.count({ where }),
    ]);
    return { data: rows.map(toPendingView), total, page, pageSize };
  }

  /** Pending requests older than `hours` with no reminder sent (FR-DSC-12). */
  async pendingOlderThan(tenantId: string, hours: number, now: Date): Promise<DiscountApproval[]> {
    const rows = await this.prisma.discountApproval.findMany({
      where: {
        tenantId,
        status: 'PENDING',
        remindedAt: null,
        createdAt: { lte: new Date(now.getTime() - hours * 3_600_000) },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toDiscountApproval);
  }

  /** Pending requests older than `hours` with the offer context the reminder needs. */
  async pendingReminderViews(tenantId: string, hours: number, now: Date): Promise<PendingApprovalView[]> {
    const rows = await this.prisma.discountApproval.findMany({
      where: {
        tenantId,
        status: 'PENDING',
        remindedAt: null,
        createdAt: { lte: new Date(now.getTime() - hours * 3_600_000) },
      },
      include: LIST_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toPendingView);
  }

  /** Persists a status or reminder change outside a transaction (the reminder job). */
  async save(approval: DiscountApproval): Promise<void> {
    const props = approval.toProps();
    await this.prisma.discountApproval.updateMany({
      where: { id: props.id, tenantId: props.tenantId },
      data: approvalColumns(approval),
    });
  }
}
