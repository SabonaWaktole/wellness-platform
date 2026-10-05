import { Prisma, PrismaClient } from '@prisma/client';
import { Money } from '../../pricing/domain/Money';
import { dayKeyInZone } from '../../shared/domain/time/tenantDay';
import { EMPTY_INDICATORS, RawIndicators } from '../domain/KpiDefinitions';
import {
  IndicatorQuery,
  IndicatorResult,
  IPerformanceReader,
  PerformanceIndicator,
  PerformanceRecord,
  Salesperson,
} from '../application/wellness/ports/IPerformanceReader';

const DAY_MS = 86_400_000;
/** Notes are not contact: calls, emails, visits and meetings only (§6.2). */
const CONTACT_CHANNELS = ['CALL', 'EMAIL', 'VISIT', 'MEETING', 'ONLINE_MEETING'];
const CHANNELS_OF: Partial<Record<PerformanceIndicator, string[]>> = {
  CALLS: ['CALL'],
  EMAILS: ['EMAIL'],
  VISITS: ['VISIT'],
  // Online meetings count as meetings.
  MEETINGS: ['MEETING', 'ONLINE_MEETING'],
  COMPANIES_CONTACTED: CONTACT_CHANNELS,
};
const OPEN_FOLLOW_UP = ['SCHEDULED', 'CONFIRMED'];

const utcDay = (key: string) => new Date(`${key}T00:00:00.000Z`);
const nextDay = (key: string) => new Date(utcDay(key).getTime() + DAY_MS);

const nameOf = (user: { firstName: string | null; lastName: string | null; email: string }) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

interface DealResult {
  id: string;
  ownerId: string;
  /** The calendar date of the win or loss. */
  at: Date;
  createdAt: Date;
  clientId: string;
  companyName: string;
  title: string | null;
  annualValue: Money | null;
}

/**
 * The counts behind the Performance screen (SRS §6.2). Each indicator is read on
 * the date of its own event and for the salesperson responsible then (FR-PRF-05):
 * activities by author, offers by creator, follow-ups by assignee, and won or lost
 * deals by the owner recorded on the stage history row, so reassigning a deal
 * afterwards does not move its result (D13).
 *
 * Money is summed as `Money` (decimal), never as a JavaScript number.
 */
export class PrismaPerformanceReader implements IPerformanceReader {
  constructor(private readonly prisma: PrismaClient) {}

  async people(tenantId: string, ids: readonly string[]): Promise<Salesperson[]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId, id: { in: [...ids] } },
      select: { id: true, firstName: true, lastName: true, email: true, isActive: true },
    });
    return users.map((user) => ({ id: user.id, name: nameOf(user), isActive: user.isActive }));
  }

  async indicators(query: IndicatorQuery): Promise<IndicatorResult> {
    const ids = [...query.salespersonIds];
    const perPerson = new Map<string, RawIndicators>(ids.map((id) => [id, EMPTY_INDICATORS()]));
    const of = (id: string) => perPerson.get(id)!;
    const { tenantId, window } = query;
    const between = { gte: window.start, lt: window.end };

    const [contacts, created, sent, won, lost, completed, overdue] = await Promise.all([
      this.prisma.interaction.groupBy({
        by: ['authorUserId', 'channel', 'clientId'],
        where: { tenantId, authorUserId: { in: ids }, channel: { in: CONTACT_CHANNELS }, occurredAt: between },
        _count: { _all: true },
      }),
      this.prisma.quotation.groupBy({
        by: ['createdByUserId'],
        where: { tenantId, createdByUserId: { in: ids }, version: 1, createdAt: between },
        _count: { _all: true },
      }),
      this.prisma.quotation.groupBy({
        by: ['createdByUserId'],
        where: { tenantId, createdByUserId: { in: ids }, sentAt: between },
        _count: { _all: true },
      }),
      this.dealResults(query, 'WON'),
      this.dealResults(query, 'LOST'),
      this.prisma.appointment.findMany({
        where: { tenantId, kind: 'FOLLOW_UP', status: 'COMPLETED', assignedUserId: { in: ids }, completedAt: between },
        select: { assignedUserId: true, scheduledAt: true, completedAt: true },
      }),
      this.prisma.appointment.groupBy({
        by: ['assignedUserId'],
        where: { tenantId, kind: 'FOLLOW_UP', status: { in: OPEN_FOLLOW_UP }, assignedUserId: { in: ids }, scheduledAt: { lt: query.now } },
        _count: { _all: true },
      }),
    ]);

    const companiesByPerson = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
    const everyCompany = new Set<string>();
    for (const row of contacts) {
      const raw = of(row.authorUserId);
      const count = row._count._all;
      if (row.channel === 'CALL') raw.calls += count;
      else if (row.channel === 'EMAIL') raw.emails += count;
      else if (row.channel === 'VISIT') raw.visits += count;
      else raw.meetings += count;
      companiesByPerson.get(row.authorUserId)!.add(row.clientId);
      everyCompany.add(row.clientId);
    }
    for (const [id, companies] of companiesByPerson) of(id).companiesContacted = companies.size;

    for (const row of created) of(row.createdByUserId).offersCreated = row._count._all;
    for (const row of sent) of(row.createdByUserId).offersSent = row._count._all;

    for (const deal of won) {
      const raw = of(deal.ownerId);
      raw.dealsWon += 1;
      if (deal.annualValue) raw.totalValue = raw.totalValue.add(deal.annualValue);
      raw.closeDays.push(Math.max(0, (deal.at.getTime() - deal.createdAt.getTime()) / DAY_MS));
    }
    for (const deal of lost) of(deal.ownerId).dealsLost += 1;

    for (const followUp of completed) {
      const raw = of(followUp.assignedUserId);
      raw.followUpsCompleted += 1;
      // On time is judged by the day, in the workspace time zone: done on the due day is on time.
      if (dayKeyInZone(followUp.completedAt!, query.timezone) <= dayKeyInZone(followUp.scheduledAt, query.timezone)) {
        raw.followUpsOnTime += 1;
      }
    }
    for (const row of overdue) of(row.assignedUserId).followUpsOverdue = row._count._all;

    return { perPerson, companiesContacted: everyCompany.size };
  }

  /**
   * Deals whose latest result is a win (or loss) dated in the period. A reopened deal has no won
   * date until it is won again, so it counts once, by its latest result. The salesperson is the
   * owner on the latest history row of that result; rows from before the owner was recorded took
   * the deal's owner in the migration.
   */
  private async dealResults(query: IndicatorQuery, result: 'WON' | 'LOST'): Promise<DealResult[]> {
    const { tenantId, days } = query;
    const column = result === 'WON' ? 'wonAt' : 'lostAt';
    const deals = await this.prisma.deal.findMany({
      where: { tenantId, deletedAt: null, [column]: { gte: utcDay(days.from), lt: nextDay(days.to) } },
      select: {
        id: true,
        ownerUserId: true,
        createdAt: true,
        wonAt: true,
        lostAt: true,
        clientId: true,
        title: true,
        agreedAnnualValue: true,
        client: { select: { name: true } },
      },
    });
    if (deals.length === 0) return [];

    const history = await this.prisma.dealStageHistory.findMany({
      where: { tenantId, dealId: { in: deals.map((deal) => deal.id) }, toStage: result },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      select: { dealId: true, ownerUserId: true },
    });
    const ownerAtResult = new Map<string, string | null>();
    for (const row of history) if (!ownerAtResult.has(row.dealId)) ownerAtResult.set(row.dealId, row.ownerUserId);

    const wanted = new Set(query.salespersonIds);
    return deals
      .map((deal) => ({
        id: deal.id,
        ownerId: ownerAtResult.get(deal.id) ?? deal.ownerUserId,
        at: (result === 'WON' ? deal.wonAt : deal.lostAt)!,
        createdAt: deal.createdAt,
        clientId: deal.clientId,
        companyName: deal.client.name ?? '',
        title: deal.title,
        annualValue: deal.agreedAnnualValue ? Money.of(deal.agreedAnnualValue.toFixed(2)) : null,
      }))
      .filter((deal) => wanted.has(deal.ownerId));
  }

  async records(
    query: IndicatorQuery & { indicator: PerformanceIndicator; limit: number; offset: number }
  ): Promise<{ rows: PerformanceRecord[]; total: number }> {
    const { indicator, tenantId, window, limit, offset } = query;
    const ids = [...query.salespersonIds];
    const between = { gte: window.start, lt: window.end };
    const page = { skip: offset, take: limit };

    const channels = CHANNELS_OF[indicator];
    if (channels) {
      const where: Prisma.InteractionWhereInput = { tenantId, authorUserId: { in: ids }, channel: { in: channels }, occurredAt: between };
      const [total, rows] = await Promise.all([
        this.prisma.interaction.count({ where }),
        this.prisma.interaction.findMany({
          where,
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          ...page,
          select: { id: true, occurredAt: true, channel: true, clientId: true, authorUserId: true, dealId: true, client: { select: { name: true } } },
        }),
      ]);
      return {
        total,
        rows: rows.map((row) => ({
          kind: 'ACTIVITY' as const,
          id: row.id,
          at: row.occurredAt!,
          clientId: row.clientId,
          companyName: row.client.name ?? '',
          salespersonId: row.authorUserId,
          label: null,
          detail: row.channel,
          dealId: row.dealId,
          annualValue: null,
        })),
      };
    }

    if (indicator === 'OFFERS_CREATED' || indicator === 'OFFERS_SENT') {
      const where: Prisma.QuotationWhereInput =
        indicator === 'OFFERS_CREATED'
          ? { tenantId, createdByUserId: { in: ids }, version: 1, createdAt: between }
          : { tenantId, createdByUserId: { in: ids }, sentAt: between };
      const [total, rows] = await Promise.all([
        this.prisma.quotation.count({ where }),
        this.prisma.quotation.findMany({
          where,
          orderBy: [indicator === 'OFFERS_CREATED' ? { createdAt: 'desc' } : { sentAt: 'desc' }, { id: 'desc' }],
          ...page,
          select: { id: true, number: true, version: true, status: true, createdAt: true, sentAt: true, clientId: true, createdByUserId: true, dealId: true, client: { select: { name: true } } },
        }),
      ]);
      return {
        total,
        rows: rows.map((row) => ({
          kind: 'OFFER' as const,
          id: row.id,
          at: (indicator === 'OFFERS_CREATED' ? row.createdAt : row.sentAt)!,
          clientId: row.clientId,
          companyName: row.client.name ?? '',
          salespersonId: row.createdByUserId,
          label: row.number ? `${row.number} v${row.version}` : null,
          detail: row.status,
          dealId: row.dealId,
          annualValue: null,
        })),
      };
    }

    if (indicator === 'FOLLOW_UPS_COMPLETED' || indicator === 'FOLLOW_UPS_OVERDUE') {
      const where: Prisma.AppointmentWhereInput =
        indicator === 'FOLLOW_UPS_COMPLETED'
          ? { tenantId, kind: 'FOLLOW_UP', status: 'COMPLETED', assignedUserId: { in: ids }, completedAt: between }
          : { tenantId, kind: 'FOLLOW_UP', status: { in: OPEN_FOLLOW_UP }, assignedUserId: { in: ids }, scheduledAt: { lt: query.now } };
      const [total, rows] = await Promise.all([
        this.prisma.appointment.count({ where }),
        this.prisma.appointment.findMany({
          where,
          orderBy: [indicator === 'FOLLOW_UPS_COMPLETED' ? { completedAt: 'desc' } : { scheduledAt: 'asc' }, { id: 'desc' }],
          ...page,
          select: { id: true, scheduledAt: true, completedAt: true, type: true, clientId: true, assignedUserId: true, dealId: true, client: { select: { name: true } } },
        }),
      ]);
      return {
        total,
        rows: rows.map((row) => ({
          kind: 'FOLLOW_UP' as const,
          id: row.id,
          at: indicator === 'FOLLOW_UPS_COMPLETED' ? row.completedAt! : row.scheduledAt,
          clientId: row.clientId,
          companyName: row.client.name ?? '',
          salespersonId: row.assignedUserId,
          label: null,
          detail: row.type,
          dealId: row.dealId,
          annualValue: null,
        })),
      };
    }

    // Deals: won, lost, and the figures built on them.
    const wantWon = indicator !== 'DEALS_LOST';
    const wantLost = indicator === 'DEALS_LOST' || indicator === 'CONVERSION_RATE';
    const [won, lost] = await Promise.all([wantWon ? this.dealResults(query, 'WON') : [], wantLost ? this.dealResults(query, 'LOST') : []]);
    const all = [
      ...won.map((deal) => ({ deal, detail: 'WON' })),
      ...lost.map((deal) => ({ deal, detail: 'LOST' })),
    ].sort((a, b) => b.deal.at.getTime() - a.deal.at.getTime() || a.deal.id.localeCompare(b.deal.id));
    return {
      total: all.length,
      rows: all.slice(offset, offset + limit).map(({ deal, detail }) => ({
        kind: 'DEAL' as const,
        id: deal.id,
        at: deal.at,
        clientId: deal.clientId,
        companyName: deal.companyName,
        salespersonId: deal.ownerId,
        label: deal.title,
        detail,
        dealId: deal.id,
        annualValue: detail === 'WON' ? deal.annualValue?.toString() ?? null : null,
      })),
    };
  }
}
