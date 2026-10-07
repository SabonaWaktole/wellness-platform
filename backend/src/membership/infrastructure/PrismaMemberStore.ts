import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { insensitiveContains, insensitiveEquals } from '../../shared/infrastructure/prisma/caseInsensitiveFilter';
import type { PersonalDetails, MemberLanguage } from '../domain/Member';
import type { MemberStatus } from '../domain/memberValidity';
import type { Tier } from '../domain/Tier';
import type { TermSource } from '../domain/MemberTerm';
import type {
  IMemberStore,
  FamilyLinkData,
  MemberFamilyEventRecord,
  MemberRecord,
  MemberSearchParams,
  MemberStatusHistoryRecord,
  MemberTermRecord,
  MemberTierHistoryRecord,
  NewMemberData,
  StatusHistoryEntry,
} from '../application/ports/IMemberStore';
import { randomUUID } from 'crypto';

const day = (value: Date | null): string | null => (value ? value.toISOString().slice(0, 10) : null);
const dateOnly = (value: string | null): Date | null => (value ? new Date(`${value}T00:00:00.000Z`) : null);

/** Every column except the card token, which never leaves the database through this store. */
const MEMBER_SELECT = {
  id: true,
  memberNumber: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  phone: true,
  email: true,
  language: true,
  cityId: true,
  status: true,
  currentTier: true,
  startsOn: true,
  employerClientId: true,
  employer: { select: { name: true } },
  formerEmployerClientId: true,
  leftCompanyAt: true,
  principalMemberId: true,
  relationshipId: true,
  relationshipConfirmedBy: true,
  relationshipConfirmedAt: true,
  note: true,
  createdBy: true,
  createdAt: true,
  closedAt: true,
  anonymisedAt: true,
} satisfies Prisma.MemberSelect;

type MemberRow = Prisma.MemberGetPayload<{ select: typeof MEMBER_SELECT }>;

const toRecord = (row: MemberRow): MemberRecord => ({
  id: row.id,
  memberNumber: row.memberNumber,
  firstName: row.firstName,
  lastName: row.lastName,
  dateOfBirth: day(row.dateOfBirth),
  phone: row.phone,
  email: row.email,
  language: row.language as MemberLanguage,
  cityId: row.cityId,
  status: row.status as MemberStatus,
  currentTier: row.currentTier as Tier,
  startsOn: day(row.startsOn)!,
  employerClientId: row.employerClientId,
  employerName: row.employer?.name ?? null,
  formerEmployerClientId: row.formerEmployerClientId,
  leftCompanyAt: day(row.leftCompanyAt),
  principalMemberId: row.principalMemberId,
  relationshipId: row.relationshipId,
  relationshipConfirmedBy: row.relationshipConfirmedBy,
  relationshipConfirmedAt: row.relationshipConfirmedAt,
  note: row.note,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
  closedAt: row.closedAt,
  anonymisedAt: row.anonymisedAt,
});

const SORT: Record<MemberSearchParams['sortBy'], (dir: 'asc' | 'desc') => Prisma.MemberOrderByWithRelationInput[]> = {
  name: (dir) => [{ lastName: dir }, { firstName: dir }, { memberNumber: 'asc' }],
  memberNumber: (dir) => [{ memberNumber: dir }],
  tier: (dir) => [{ currentTier: dir }, { lastName: 'asc' }, { firstName: 'asc' }],
  createdAt: (dir) => [{ createdAt: dir }, { memberNumber: dir }],
};

export class PrismaMemberStore implements IMemberStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async create(data: NewMemberData): Promise<MemberRecord> {
    const { details } = data;
    const row = await this.prisma.member.create({
      data: {
        id: data.id,
        tenantId: data.tenantId,
        memberNumber: data.memberNumber,
        cardToken: data.cardToken,
        createdBy: data.createdBy,
        startsOn: dateOnly(data.startsOn)!,
        status: 'ACTIVE',
        currentTier: 'BRONZE',
        employerClientId: data.employerClientId ?? null,
        firstName: details.firstName,
        lastName: details.lastName,
        dateOfBirth: dateOnly(details.dateOfBirth),
        phone: details.phone,
        email: details.email,
        language: details.language,
        cityId: details.cityId,
        note: details.note,
      },
      select: MEMBER_SELECT,
    });
    return toRecord(row);
  }

  async find(tenantId: string, id: string): Promise<MemberRecord | null> {
    const row = await this.prisma.member.findFirst({ where: { id, tenantId }, select: MEMBER_SELECT });
    return row ? toRecord(row) : null;
  }

  async findDuplicates(tenantId: string, details: PersonalDetails, excludeId?: string): Promise<MemberRecord[]> {
    const matches: Prisma.MemberWhereInput[] = [];
    if (details.email) matches.push({ email: insensitiveEquals(details.email) });
    if (details.phone) matches.push({ phone: details.phone });
    if (details.dateOfBirth) {
      matches.push({
        firstName: insensitiveEquals(details.firstName),
        lastName: insensitiveEquals(details.lastName),
        dateOfBirth: dateOnly(details.dateOfBirth),
      });
    }
    if (matches.length === 0) return [];
    const rows = await this.prisma.member.findMany({
      where: { tenantId, OR: matches, ...(excludeId ? { id: { not: excludeId } } : {}) },
      orderBy: { memberNumber: 'asc' },
      take: 10,
      select: MEMBER_SELECT,
    });
    return rows.map(toRecord);
  }

  async updateDetails(tenantId: string, id: string, details: PersonalDetails): Promise<void> {
    await this.prisma.member.updateMany({
      where: { id, tenantId },
      data: {
        firstName: details.firstName,
        lastName: details.lastName,
        dateOfBirth: dateOnly(details.dateOfBirth),
        phone: details.phone,
        email: details.email,
        language: details.language,
        cityId: details.cityId,
        note: details.note,
      },
    });
  }

  async setStatus(tenantId: string, id: string, status: MemberStatus, closedAt: Date | null): Promise<void> {
    await this.prisma.member.updateMany({ where: { id, tenantId }, data: { status, closedAt } });
  }

  async addStatusHistory(entry: StatusHistoryEntry): Promise<void> {
    await this.prisma.memberStatusHistory.create({ data: { id: randomUUID(), ...entry } });
  }

  async setEmployer(tenantId: string, id: string, clientId: string): Promise<void> {
    await this.prisma.member.updateMany({ where: { id, tenantId }, data: { employerClientId: clientId } });
  }

  async cityExists(tenantId: string, cityId: string): Promise<boolean> {
    return (await this.prisma.city.count({ where: { id: cityId, tenantId } })) > 0;
  }

  async search(tenantId: string, params: MemberSearchParams): Promise<{ data: MemberRecord[]; total: number }> {
    const and: Prisma.MemberWhereInput[] = [];

    // Every word must match the name, number, phone or email, so "ana hoxha" finds Ana Hoxha.
    for (const word of (params.query ?? '').trim().split(/\s+/).filter(Boolean)) {
      and.push({
        OR: [
          { firstName: insensitiveContains(word) },
          { lastName: insensitiveContains(word) },
          { memberNumber: insensitiveContains(word) },
          { phone: { contains: word.replace(/[\s\-().]/g, '') || word } },
          { email: insensitiveContains(word) },
        ],
      });
    }
    if (params.tier) and.push({ currentTier: params.tier });
    if (params.status) and.push({ status: params.status });
    if (params.validity) and.push({ status: params.validity === 'VALID' ? 'ACTIVE' : { not: 'ACTIVE' } });
    if (params.source === 'CORPORATE') and.push({ employerClientId: { not: null } });
    if (params.source === 'FAMILY') and.push({ principalMemberId: { not: null } });
    if (params.source === 'INDIVIDUAL') and.push({ employerClientId: null, principalMemberId: null });
    if (params.employerClientId) and.push({ employerClientId: params.employerClientId });
    if (params.formerEmployee) and.push({ formerEmployerClientId: { not: null } });
    if (params.vipReviewDue) {
      const { from, to } = params.vipReviewDue;
      and.push({ terms: { some: { source: 'VIP', endsOn: { gte: dateOnly(from)!, lte: dateOnly(to)! } } } });
      // A later approval extends VIP, so the review is not due yet.
      and.push({ NOT: { terms: { some: { source: 'VIP', endsOn: { gt: dateOnly(to)! } } } } });
    }
    if (params.expiringSoon) {
      and.push({
        terms: { some: { source: 'PAID', endsOn: { gte: dateOnly(params.expiringSoon.from)!, lte: dateOnly(params.expiringSoon.to)! } } },
      });
    }
    if (params.areaId) and.push({ employer: { is: { areaId: params.areaId } } });
    if (params.cityId) and.push({ employer: { is: { cityId: params.cityId } } });

    const where: Prisma.MemberWhereInput = { tenantId, AND: and };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.member.count({ where }),
      this.prisma.member.findMany({
        where,
        select: MEMBER_SELECT,
        orderBy: SORT[params.sortBy](params.sortDir),
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
    ]);
    return { data: rows.map(toRecord), total };
  }

  async listTerms(memberId: string): Promise<MemberTermRecord[]> {
    const rows = await this.prisma.memberTerm.findMany({ where: { memberId }, orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }] });
    return rows.map((row) => ({
      id: row.id,
      tier: row.tier as Tier,
      source: row.source as TermSource,
      startsOn: day(row.startsOn)!,
      endsOn: day(row.endsOn),
    }));
  }

  async latestPaidEnds(memberIds: string[]): Promise<Record<string, string>> {
    if (memberIds.length === 0) return {};
    const rows = await this.prisma.memberTerm.groupBy({ by: ['memberId'], where: { memberId: { in: memberIds }, source: 'PAID', endsOn: { not: null } }, _max: { endsOn: true } });
    return Object.fromEntries(rows.filter((row) => row._max.endsOn).map((row) => [row.memberId, row._max.endsOn!.toISOString().slice(0, 10)]));
  }

  async listTierHistory(memberId: string): Promise<MemberTierHistoryRecord[]> {
    const rows = await this.prisma.memberTierHistory.findMany({ where: { memberId }, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => ({
      id: row.id,
      fromTier: row.fromTier as Tier,
      toTier: row.toTier as Tier,
      reason: row.reason,
      comment: row.comment,
      changedByUserId: row.changedByUserId,
      createdAt: row.createdAt,
    }));
  }

  async listStatusHistory(memberId: string): Promise<MemberStatusHistoryRecord[]> {
    const rows = await this.prisma.memberStatusHistory.findMany({ where: { memberId }, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => ({
      id: row.id,
      fromStatus: row.fromStatus as MemberStatus | null,
      toStatus: row.toStatus as MemberStatus,
      reason: row.reason,
      changedByUserId: row.changedByUserId,
      createdAt: row.createdAt,
    }));
  }

  async listDependants(tenantId: string, principalId: string): Promise<MemberRecord[]> {
    const rows = await this.prisma.member.findMany({
      where: { tenantId, principalMemberId: principalId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: MEMBER_SELECT,
    });
    return rows.map(toRecord);
  }

  async setFamilyLink(tenantId: string, id: string, link: FamilyLinkData | null): Promise<void> {
    await this.prisma.member.updateMany({
      where: { id, tenantId },
      data: {
        principalMemberId: link?.principalMemberId ?? null,
        relationshipId: link?.relationshipId ?? null,
        relationshipConfirmedBy: link?.confirmedBy ?? null,
        relationshipConfirmedAt: link?.confirmedAt ?? null,
      },
    });
  }

  async addFamilyEvent(event: Omit<MemberFamilyEventRecord, 'id' | 'at'> & { memberId: string }): Promise<void> {
    await this.prisma.memberFamilyEvent.create({ data: { id: randomUUID(), ...event } });
  }

  async listFamilyEvents(memberId: string): Promise<MemberFamilyEventRecord[]> {
    const rows = await this.prisma.memberFamilyEvent.findMany({ where: { memberId }, orderBy: { at: 'desc' } });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as 'LINKED' | 'REMOVED',
      principalMemberId: row.principalMemberId,
      relationshipId: row.relationshipId,
      reason: row.reason,
      byUserId: row.byUserId,
      at: row.at,
    }));
  }

  async userNames(tenantId: string, userIds: string[]): Promise<Record<string, string>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return {};
    const users = await this.prisma.user.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, firstName: true, lastName: true, email: true } });
    return Object.fromEntries(users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email]));
  }
}
