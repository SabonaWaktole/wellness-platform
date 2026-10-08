import { Prisma, PrismaClient } from '@prisma/client';
import { addDays } from '../../contracts/domain/calendarDay';
import { IS_MYSQL } from '../../shared/infrastructure/prisma/provider';
import type { TierChangeReason, TierHistoryFigure } from '../domain/MembershipKpiDefinitions';
import type { Tier } from '../domain/Tier';
import type { PaymentKind } from '../domain/termDates';
import type {
  EmployerRow,
  IMembershipReportReader,
  MonthEnd,
  PaymentGroup,
  RenewalTermFigure,
  ReportFilters,
  ReportQuery,
  TierCount,
  WorkingListKind,
  WorkingListRow,
} from '../application/reports/ports/IMembershipReportReader';
import { WORKING_LIST_LIMIT } from '../application/reports/ports/IMembershipReportReader';

const dateOnly = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const dayText = (value: Date | null): string | null => (value ? value.toISOString().slice(0, 10) : null);
const plusDays = (value: string, days: number): string => dayText(addDays(dateOnly(value), days))!;
const chunks = <T>(items: readonly T[], size = 5000): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const DOWNGRADE_REASONS: TierChangeReason[] = ['NOT_RENEWED', 'COMPANY_CONTRACT_ENDED', 'LEFT_COMPANY', 'VIP_ENDED'];

/**
 * Who a filter lets in: the employer company's segment, id, Area and City
 * (FR-RPT-01). The tier is not here because each figure reads it from its own
 * place (the member's current tier, the term's tier, the payment's new tier).
 */
function whoWhere(f: ReportFilters): Prisma.MemberWhereInput[] {
  const and: Prisma.MemberWhereInput[] = [];
  if (f.segment === 'CORPORATE') and.push({ employerClientId: { not: null } });
  if (f.segment === 'INDIVIDUAL') and.push({ employerClientId: null });
  if (f.employerClientId) and.push({ employerClientId: f.employerClientId });
  if (f.areaId) and.push({ employer: { is: { areaId: f.areaId } } });
  if (f.cityId) and.push({ employer: { is: { cityId: f.cityId } } });
  return and;
}

const memberFilter = (q: ReportQuery): Prisma.MemberWhereInput => ({ tenantId: q.tenantId, AND: whoWhere(q.filters) });
const activeWhere = (q: ReportQuery): Prisma.MemberWhereInput => ({
  tenantId: q.tenantId,
  status: 'ACTIVE',
  ...(q.filters.tier ? { currentTier: q.filters.tier } : {}),
  AND: whoWhere(q.filters),
});

/** Member columns the working lists send. */
const LIST_SELECT = {
  id: true,
  memberNumber: true,
  firstName: true,
  lastName: true,
  currentTier: true,
  phone: true,
  email: true,
  employerClientId: true,
  employer: { select: { name: true } },
  formerEmployerClientId: true,
  formerEmployer: { select: { name: true } },
  leftCompanyAt: true,
} satisfies Prisma.MemberSelect;

export class PrismaMembershipReportReader implements IMembershipReportReader {
  constructor(private readonly prisma: PrismaClient) {}

  async locationIsPredefined(tenantId: string, location: { areaId?: string; cityId?: string }): Promise<boolean> {
    const [area, city] = await Promise.all([
      location.areaId ? this.prisma.area.findFirst({ where: { id: location.areaId, tenantId }, select: { id: true } }) : null,
      location.cityId
        ? this.prisma.city.findFirst({ where: { id: location.cityId, tenantId, ...(location.areaId ? { areaId: location.areaId } : {}) }, select: { id: true } })
        : null,
    ]);
    return (!location.areaId || area !== null) && (!location.cityId || city !== null);
  }

  async employerExists(tenantId: string, clientId: string): Promise<boolean> {
    return (await this.prisma.client.findFirst({ where: { id: clientId, tenantId }, select: { id: true } })) !== null;
  }

  async activeByTier(q: ReportQuery): Promise<TierCount[]> {
    const rows = await this.prisma.member.groupBy({ by: ['currentTier'], where: activeWhere(q), _count: { _all: true } });
    return rows.map((r) => ({ tier: r.currentTier as Tier, count: r._count._all }));
  }

  async activeBySegment(q: ReportQuery): Promise<{ corporate: number; individual: number }> {
    const where = activeWhere(q);
    const [corporate, individual] = await Promise.all([
      this.prisma.member.count({ where: { AND: [where, { employerClientId: { not: null } }] } }),
      this.prisma.member.count({ where: { AND: [where, { employerClientId: null }] } }),
    ]);
    return { corporate, individual };
  }

  /**
   * The last status row and the last tier row on or before each month end, per
   * member, with `ROW_NUMBER()` (MySQL 8 and PostgreSQL). A member with no tier
   * row is Bronze, the floor (D2). One statement per month, run together. The
   * values are pushed in the order the text uses them, which MySQL's positional
   * `?` needs.
   */
  async activeAtMonthEnds(q: ReportQuery, months: readonly MonthEnd[]) {
    const perMonth = await Promise.all(months.map(({ month, end }) => this.activeAtMonthEnd(q, month, end)));
    return perMonth.flat();
  }

  private async activeAtMonthEnd(q: ReportQuery, month: string, end: Date) {
    const params: unknown[] = [];
    const p = (value: unknown) => {
      params.push(value);
      return IS_MYSQL ? '?' : `$${params.length}`;
    };
    const sTenant = p(q.tenantId);
    const sEnd = p(end);
    const tTenant = p(q.tenantId);
    const tEnd = p(end);
    const where: string[] = [`m."tenantId" = ${p(q.tenantId)}`, `m."createdAt" < ${p(end)}`];
    const f = q.filters;
    if (f.segment === 'CORPORATE') where.push('m."employerClientId" IS NOT NULL');
    if (f.segment === 'INDIVIDUAL') where.push('m."employerClientId" IS NULL');
    if (f.employerClientId) where.push(`m."employerClientId" = ${p(f.employerClientId)}`);
    if (f.areaId) where.push(`c."areaId" = ${p(f.areaId)}`);
    if (f.cityId) where.push(`c."cityId" = ${p(f.cityId)}`);
    if (f.tier) where.push(`COALESCE(t."toTier", 'BRONZE') = ${p(f.tier)}`);
    const text = `
      WITH s AS (
        SELECT h."memberId", h."toStatus",
               ROW_NUMBER() OVER (PARTITION BY h."memberId" ORDER BY h."createdAt" DESC, h."id" DESC) AS rn
        FROM "MemberStatusHistory" h JOIN "Member" sm ON sm."id" = h."memberId"
        WHERE sm."tenantId" = ${sTenant} AND h."createdAt" < ${sEnd}
      ), t AS (
        SELECT h."memberId", h."toTier",
               ROW_NUMBER() OVER (PARTITION BY h."memberId" ORDER BY h."createdAt" DESC, h."id" DESC) AS rn
        FROM "MemberTierHistory" h JOIN "Member" tm ON tm."id" = h."memberId"
        WHERE tm."tenantId" = ${tTenant} AND h."createdAt" < ${tEnd}
      )
      SELECT COALESCE(t."toTier", 'BRONZE') AS tier, COUNT(*) AS count
      FROM "Member" m
      JOIN s ON s."memberId" = m."id" AND s.rn = 1 AND s."toStatus" = 'ACTIVE'
      LEFT JOIN t ON t."memberId" = m."id" AND t.rn = 1
      LEFT JOIN "Client" c ON c."id" = m."employerClientId"
      WHERE ${where.join(' AND ')}
      GROUP BY 1`;
    const rows = await this.prisma.$queryRawUnsafe<Array<{ tier: string; count: bigint | number }>>(IS_MYSQL ? text.replace(/"/g, '`') : text, ...params);
    return rows.map((r) => ({ month, tier: r.tier as Tier, count: Number(r.count) }));
  }

  async newMembers(q: ReportQuery): Promise<{ corporate: number; individual: number }> {
    const where: Prisma.MemberWhereInput = { AND: [memberFilter(q), { createdAt: { gte: q.window.start, lt: q.window.end } }] };
    const [corporate, individual] = await Promise.all([
      this.prisma.member.count({ where: { AND: [where, { employerClientId: { not: null } }] } }),
      this.prisma.member.count({ where: { AND: [where, { employerClientId: null }] } }),
    ]);
    return { corporate, individual };
  }

  async paymentGroups(q: ReportQuery): Promise<PaymentGroup[]> {
    const rows = await this.prisma.memberPayment.groupBy({
      by: ['kind', 'fromTier', 'toTier'],
      where: {
        tenantId: q.tenantId,
        voidedAt: null,
        receivedOn: { gte: dateOnly(q.days.from), lte: dateOnly(q.days.to) },
        ...(q.filters.tier ? { toTier: q.filters.tier } : {}),
        member: { is: { AND: whoWhere(q.filters) } },
      },
      _count: { _all: true },
      _sum: { amount: true },
    });
    return rows.map((r) => ({
      kind: r.kind as PaymentKind,
      fromTier: r.fromTier as Tier,
      toTier: r.toTier as Tier,
      count: r._count._all,
      total: (r._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
    }));
  }

  async downgrades(q: ReportQuery): Promise<TierHistoryFigure[]> {
    const rows = await this.prisma.memberTierHistory.findMany({
      where: {
        reason: { in: DOWNGRADE_REASONS },
        createdAt: { gte: q.window.start, lt: q.window.end },
        ...(q.filters.tier ? { toTier: q.filters.tier } : {}),
        member: { is: memberFilter(q) },
      },
      select: { fromTier: true, toTier: true, reason: true },
    });
    return rows.map((r) => ({ fromTier: r.fromTier as Tier, toTier: r.toTier as Tier, reason: r.reason as TierChangeReason }));
  }

  /**
   * Silver and Gold paid terms whose end plus grace days falls in the period.
   * A term an upgrade closed early is neither due nor missed: the member moved up.
   * The renewal of a term is the payment of kind Renewal, not voided, behind the
   * paid term that starts the day after it ends.
   */
  async renewalTerms(q: ReportQuery): Promise<RenewalTermFigure[]> {
    const terms = await this.prisma.memberTerm.findMany({
      where: {
        source: 'PAID',
        tier: q.filters.tier ? q.filters.tier : { in: ['SILVER', 'GOLD'] },
        closedEarlyByPaymentId: null,
        endsOn: { gte: dateOnly(plusDays(q.days.from, -q.graceDays)), lte: dateOnly(plusDays(q.days.to, -q.graceDays)) },
        member: { is: memberFilter(q) },
      },
      select: { memberId: true, tier: true, endsOn: true },
    });
    const due = terms.filter((t) => t.endsOn !== null);
    if (due.length === 0) return [];

    const memberIds = [...new Set(due.map((t) => t.memberId))];
    const followers: Array<{ memberId: string; startsOn: Date; paymentId: string }> = [];
    for (const ids of chunks(memberIds)) {
      const rows = await this.prisma.memberTerm.findMany({
        where: { memberId: { in: ids }, source: 'PAID', paymentId: { not: null }, startsOn: { gt: due.reduce((min, t) => (t.endsOn! < min ? t.endsOn! : min), due[0].endsOn!) } },
        select: { memberId: true, startsOn: true, paymentId: true },
      });
      for (const r of rows) followers.push({ memberId: r.memberId, startsOn: r.startsOn, paymentId: r.paymentId! });
    }
    const paid = new Map<string, Date>();
    for (const ids of chunks([...new Set(followers.map((f) => f.paymentId))])) {
      const rows = await this.prisma.memberPayment.findMany({ where: { id: { in: ids }, kind: 'RENEWAL', voidedAt: null }, select: { id: true, receivedOn: true } });
      for (const r of rows) paid.set(r.id, r.receivedOn);
    }
    const renewedOn = new Map<string, Date>();
    for (const f of followers) {
      const received = paid.get(f.paymentId);
      if (received) renewedOn.set(`${f.memberId}:${dayText(f.startsOn)}`, received);
    }
    return due.map((t) => ({
      tier: t.tier as Tier,
      endsOn: t.endsOn!,
      renewalPaidOn: renewedOn.get(`${t.memberId}:${dayText(addDays(t.endsOn!, 1))}`) ?? null,
    }));
  }

  async employers(q: ReportQuery): Promise<EmployerRow[]> {
    const today = dateOnly(q.today);
    const active = activeWhere(q);
    const live = { startsOn: { lte: today }, OR: [{ endsOn: null }, { endsOn: { gte: today } }] };
    const tally = async (extra: Prisma.MemberWhereInput) => {
      const rows = await this.prisma.member.findMany({ where: { AND: [active, { employerClientId: { not: null } }, extra] }, select: { employerClientId: true } });
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r.employerClientId!, (counts.get(r.employerClientId!) ?? 0) + 1);
      return counts;
    };
    const [members, sponsored, upgraded] = await Promise.all([
      tally({}),
      tally({ currentTier: 'SILVER', terms: { some: { source: 'SPONSORED', ...live } } }),
      tally({ terms: { some: { source: 'PAID', ...live } } }),
    ]);
    const f = q.filters;
    const former = await this.prisma.member.groupBy({
      by: ['formerEmployerClientId'],
      where: {
        tenantId: q.tenantId,
        formerEmployerClientId: f.employerClientId ?? { not: null },
        ...(f.areaId || f.cityId ? { formerEmployer: { is: { ...(f.areaId ? { areaId: f.areaId } : {}), ...(f.cityId ? { cityId: f.cityId } : {}) } } } : {}),
      },
      _count: { _all: true },
    });
    const formerCounts = new Map(former.map((r) => [r.formerEmployerClientId!, r._count._all]));
    const ids = [...new Set([...members.keys(), ...formerCounts.keys()])];
    if (ids.length === 0 || f.segment === 'INDIVIDUAL') return [];
    const clients = await this.prisma.client.findMany({ where: { tenantId: q.tenantId, id: { in: ids } }, select: { id: true, name: true } });
    const names = new Map(clients.map((c) => [c.id, c.name]));
    return ids
      .map((id) => ({
        companyId: id,
        name: names.get(id) ?? null,
        members: members.get(id) ?? 0,
        sponsoredSilver: sponsored.get(id) ?? 0,
        upgradedToPaid: upgraded.get(id) ?? 0,
        formerEmployees: formerCounts.get(id) ?? 0,
      }))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.companyId.localeCompare(b.companyId));
  }

  async workingList(q: ReportQuery, kind: WorkingListKind): Promise<WorkingListRow[]> {
    const today = q.today;
    const row = (m: Prisma.MemberGetPayload<{ select: typeof LIST_SELECT }>, date: string | null, former = false): WorkingListRow => ({
      memberId: m.id,
      memberNumber: m.memberNumber,
      firstName: m.firstName,
      lastName: m.lastName,
      tier: m.currentTier as Tier,
      date,
      employer: former
        ? m.formerEmployerClientId ? { id: m.formerEmployerClientId, name: m.formerEmployer?.name ?? null } : null
        : m.employerClientId ? { id: m.employerClientId, name: m.employer?.name ?? null } : null,
      phone: m.phone,
      email: m.email,
    });

    if (kind === 'FORMER_EMPLOYEES') {
      const f = q.filters;
      const rows = await this.prisma.member.findMany({
        where: {
          tenantId: q.tenantId,
          formerEmployerClientId: f.employerClientId ?? { not: null },
          ...(f.tier ? { currentTier: f.tier } : {}),
          ...(f.areaId || f.cityId ? { formerEmployer: { is: { ...(f.areaId ? { areaId: f.areaId } : {}), ...(f.cityId ? { cityId: f.cityId } : {}) } } } : {}),
        },
        select: LIST_SELECT,
        orderBy: [{ leftCompanyAt: 'desc' }, { lastName: 'asc' }, { memberNumber: 'asc' }],
        take: WORKING_LIST_LIMIT,
      });
      return rows.map((m) => row(m, dayText(m.leftCompanyAt), true));
    }

    const isVip = kind === 'VIP_REVIEW';
    const to = plusDays(today, isVip ? q.vipReviewNoticeDays : q.expiringSoonDays);
    const source = isVip ? 'VIP' : 'PAID';
    const rows = await this.prisma.member.findMany({
      where: {
        AND: [
          // Expiring memberships are active members (§9.3); a VIP review is due whatever the status, as on the member list.
          isVip ? memberFilter(q) : activeWhere(q),
          ...(isVip && q.filters.tier ? [{ currentTier: q.filters.tier }] : []),
          { terms: { some: { source, endsOn: { gte: dateOnly(today), lte: dateOnly(to) } } } },
        ],
      },
      select: { ...LIST_SELECT, terms: { where: { source }, select: { endsOn: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { memberNumber: 'asc' }],
    });
    // The badge reads the latest paid end, and a later VIP approval extends the review, so a member counts only when the latest end is inside the window.
    const out: WorkingListRow[] = [];
    for (const m of rows) {
      const ends = m.terms.map((t) => dayText(t.endsOn)).filter((d): d is string => d !== null).sort();
      const latest = ends[ends.length - 1] ?? null;
      if (latest !== null && latest >= today && latest <= to) out.push(row(m, latest));
      if (out.length >= WORKING_LIST_LIMIT) break;
    }
    return out;
  }
}
