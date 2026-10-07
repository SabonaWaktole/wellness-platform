import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import type { VipRequestStatus } from '../domain/vipRequest';
import type { IVipRequestStore, NewVipRequest, VipRequestRecord } from '../application/ports/IVipRequestStore';

const INCLUDE = { member: { select: { memberNumber: true, firstName: true, lastName: true } } } satisfies Prisma.VipRequestInclude;
type Row = Prisma.VipRequestGetPayload<{ include: typeof INCLUDE }>;

const toRecord = (row: Row): VipRequestRecord => ({
  id: row.id,
  memberId: row.memberId,
  memberNumber: row.member.memberNumber,
  memberFirstName: row.member.firstName,
  memberLastName: row.member.lastName,
  requestedBy: row.requestedBy,
  reason: row.reason,
  status: row.status as VipRequestStatus,
  decidedBy: row.decidedBy,
  decidedAt: row.decidedAt,
  decisionNote: row.decisionNote,
  endedAt: row.endedAt,
  endedBy: row.endedBy,
  endReason: row.endReason,
  createdAt: row.createdAt,
});

export class PrismaVipRequestStore implements IVipRequestStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async create(request: NewVipRequest): Promise<VipRequestRecord> {
    return toRecord(await this.prisma.vipRequest.create({ data: { ...request, status: 'PENDING' }, include: INCLUDE }));
  }

  async find(tenantId: string, id: string): Promise<VipRequestRecord | null> {
    const row = await this.prisma.vipRequest.findFirst({ where: { id, tenantId }, include: INCLUDE });
    return row ? toRecord(row) : null;
  }

  async findPending(tenantId: string, memberId: string): Promise<VipRequestRecord | null> {
    const row = await this.prisma.vipRequest.findFirst({ where: { tenantId, memberId, status: 'PENDING' }, include: INCLUDE });
    return row ? toRecord(row) : null;
  }

  async decide(tenantId: string, id: string, d: { status: 'APPROVED' | 'REJECTED'; decidedBy: string; decidedAt: Date; note: string | null }): Promise<void> {
    await this.prisma.vipRequest.updateMany({
      where: { id, tenantId },
      data: { status: d.status, decidedBy: d.decidedBy, decidedAt: d.decidedAt, decisionNote: d.note },
    });
  }

  async markLatestApprovedEnded(tenantId: string, memberId: string, ended: { endedAt: Date; endedBy: string; reason: string }): Promise<void> {
    const latest = await this.prisma.vipRequest.findFirst({
      where: { tenantId, memberId, status: 'APPROVED', endedAt: null },
      orderBy: [{ decidedAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (!latest) return;
    await this.prisma.vipRequest.update({ where: { id: latest.id }, data: { endedAt: ended.endedAt, endedBy: ended.endedBy, endReason: ended.reason } });
  }

  async listForMember(tenantId: string, memberId: string): Promise<VipRequestRecord[]> {
    const rows = await this.prisma.vipRequest.findMany({ where: { tenantId, memberId }, include: INCLUDE, orderBy: { createdAt: 'desc' } });
    return rows.map(toRecord);
  }

  async search(tenantId: string, params: { status?: VipRequestStatus; page: number; limit: number }) {
    const where: Prisma.VipRequestWhereInput = { tenantId, ...(params.status ? { status: params.status } : {}) };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vipRequest.count({ where }),
      this.prisma.vipRequest.findMany({ where, include: INCLUDE, orderBy: { createdAt: 'desc' }, skip: (params.page - 1) * params.limit, take: params.limit }),
    ]);
    return { data: rows.map(toRecord), total };
  }
}
