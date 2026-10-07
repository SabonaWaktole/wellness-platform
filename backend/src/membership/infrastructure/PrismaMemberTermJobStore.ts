import { Prisma, PrismaClient } from '@prisma/client';
import { validityWhere } from '../../contracts/infrastructure/repositories/contractValidityWhere';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import type { ExpiringTermRow, IMemberTermJobStore, VipReviewRow } from '../application/ports/IMemberTermJobStore';

const day = (value: Date): string => value.toISOString().slice(0, 10);
const dateOnly = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

export class PrismaMemberTermJobStore implements IMemberTermJobStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async membersToReview(tenantId: string, today: string): Promise<string[]> {
    const rows = await this.prisma.member.findMany({
      where: { tenantId, currentTier: { not: 'BRONZE' }, terms: { some: { endsOn: { not: null, lt: dateOnly(today) } } } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const stale = rows.map((row) => row.id);

    // Step 3 (D9, FR-EMP-10, FR-EMP-11): a linked employee whose stored tier disagrees with the employer's
    // contract today. Judged per company in two queries, never per member.
    const linked = await this.prisma.member.findMany({
      where: { tenantId, employerClientId: { not: null }, terms: { some: { source: 'SPONSORED' } } },
      select: { employerClientId: true },
      distinct: ['employerClientId'],
    });
    const companies = linked.map((row) => row.employerClientId!);
    if (companies.length === 0) return stale;
    const validRows = await this.prisma.contract.findMany({
      where: { tenantId, clientId: { in: companies }, ...(validityWhere('VALID', dateOnly(today), 0) as Prisma.ContractWhereInput) },
      select: { clientId: true },
      distinct: ['clientId'],
    });
    const valid = validRows.map((row) => row.clientId);
    const invalid = companies.filter((id) => !valid.includes(id));
    const drifted = await this.prisma.member.findMany({
      where: {
        tenantId,
        terms: { some: { source: 'SPONSORED' } },
        OR: [
          ...(valid.length > 0 ? [{ employerClientId: { in: valid }, currentTier: 'BRONZE' }] : []),
          ...(invalid.length > 0 ? [{ employerClientId: { in: invalid }, currentTier: { not: 'BRONZE' } }] : []),
        ],
      },
      select: { id: true },
    });
    return [...new Set([...stale, ...drifted.map((row) => row.id)])].sort();
  }

  async termsToAnnounce(tenantId: string, today: string, windowEnd: string): Promise<ExpiringTermRow[]> {
    const rows = await this.prisma.memberTerm.findMany({
      where: {
        source: 'PAID',
        expiringNotifiedAt: null,
        endsOn: { gte: dateOnly(today), lte: dateOnly(windowEnd) },
        member: { tenantId, status: { not: 'CLOSED' } },
      },
      include: { member: { select: { memberNumber: true, firstName: true, lastName: true, terms: { where: { source: 'PAID' }, select: { startsOn: true } } } } },
      orderBy: [{ endsOn: 'asc' }, { id: 'asc' }],
    });
    // A member who already renewed has a later paid term, and needs no notice.
    return rows
      .filter((row) => !row.member.terms.some((other) => other.startsOn > row.startsOn))
      .map((row) => ({
        termId: row.id,
        memberId: row.memberId,
        memberNumber: row.member.memberNumber,
        memberName: `${row.member.firstName} ${row.member.lastName}`,
        endsOn: day(row.endsOn!),
      }));
  }

  async markTermsAnnounced(termIds: string[], at: Date): Promise<void> {
    if (termIds.length === 0) return;
    await this.prisma.memberTerm.updateMany({ where: { id: { in: termIds }, expiringNotifiedAt: null }, data: { expiringNotifiedAt: at } });
  }

  async vipReviewsToAnnounce(tenantId: string, today: string, windowEnd: string): Promise<VipReviewRow[]> {
    const members = await this.prisma.member.findMany({
      where: {
        tenantId,
        status: { not: 'CLOSED' },
        // The same rule as the review-due filter: a VIP term ends in the window and none ends after it.
        AND: [
          { terms: { some: { source: 'VIP', endsOn: { gte: dateOnly(today), lte: dateOnly(windowEnd) } } } },
          { NOT: { terms: { some: { source: 'VIP', endsOn: { gt: dateOnly(windowEnd) } } } } },
        ],
      },
      select: {
        id: true,
        memberNumber: true,
        firstName: true,
        lastName: true,
        terms: { where: { source: 'VIP', endsOn: { not: null } }, select: { endsOn: true }, orderBy: { endsOn: 'desc' }, take: 1 },
        vipRequests: { where: { status: 'APPROVED', endedAt: null }, orderBy: [{ decidedAt: 'desc' }, { createdAt: 'desc' }], take: 1 },
      },
    });
    const due: VipReviewRow[] = [];
    for (const member of members) {
      const request = member.vipRequests[0];
      if (!request || request.reviewNotifiedAt !== null) continue;
      due.push({
        requestId: request.id,
        memberId: member.id,
        memberNumber: member.memberNumber,
        memberName: `${member.firstName} ${member.lastName}`,
        reviewDate: day(member.terms[0].endsOn!),
      });
    }
    return due;
  }

  async markVipReviewAnnounced(requestId: string, at: Date): Promise<void> {
    await this.prisma.vipRequest.updateMany({ where: { id: requestId, reviewNotifiedAt: null }, data: { reviewNotifiedAt: at } });
  }

  async expireStaleImports(tenantId: string, cutoff: Date): Promise<number> {
    const { count } = await this.prisma.employeeImport.updateMany({
      where: { tenantId, status: 'PREVIEWED', createdAt: { lt: cutoff } },
      data: { status: 'EXPIRED', rows: Prisma.DbNull },
    });
    return count;
  }
}
