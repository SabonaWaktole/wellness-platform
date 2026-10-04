import { PrismaClient } from '@prisma/client';
import { IDiscountApprovalWrites } from '../application/ports/IDiscountApprovalWrites';
import { DiscountApproval } from '../domain/DiscountApproval';
import { approvalColumns, insertColumns, toDiscountApproval } from './prismaDiscountApprovalRows';

/** Discount approvals on the offer's transaction (FR-DSC-11). */
export class PrismaDiscountApprovalWrites implements IDiscountApprovalWrites {
  constructor(private readonly prisma: PrismaClient) {}

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

  async forOffer(tenantId: string, quotationId: string): Promise<DiscountApproval[]> {
    const rows = await this.prisma.discountApproval.findMany({
      where: { tenantId, quotationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toDiscountApproval);
  }

  async insert(approval: DiscountApproval): Promise<void> {
    await this.prisma.discountApproval.create({ data: insertColumns(approval) });
  }

  async update(approval: DiscountApproval): Promise<void> {
    const props = approval.toProps();
    await this.prisma.discountApproval.updateMany({
      where: { id: props.id, tenantId: props.tenantId },
      data: approvalColumns(approval),
    });
  }
}
