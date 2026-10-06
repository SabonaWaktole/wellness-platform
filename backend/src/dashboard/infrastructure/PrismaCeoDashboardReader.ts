import { Prisma, PrismaClient } from '@prisma/client';
import { Money } from '../../pricing/domain/Money';
import { ContractStatus } from '../../contracts/domain/Contract';
import { validityWhere } from '../../contracts/infrastructure/repositories/contractValidityWhere';
import { OPEN_DEAL_STAGES } from '../../deals/domain/DealStage';
import { OpenDeal } from '../domain/DashboardDefinitions';
import { CompanyStatusCount, ContractFigures, ContractGroup, ICeoDashboardReader } from '../application/wellness/ports/ICeoDashboardReader';

const OPEN_FOLLOW_UP = ['SCHEDULED', 'CONFIRMED'];
const SENT = 'SENT';
const utcDate = (key: string) => new Date(`${key}T00:00:00.000Z`);
const money = (value: Prisma.Decimal | null | undefined): Money => Money.of(value ? value.toString() : '0');

/**
 * The reads behind the CEO dashboard. The contract and payment figures use the same predicates as their
 * lists (`validityWhere`, the status column), so a figure and the list it opens add up to the same rows.
 */
export class PrismaCeoDashboardReader implements ICeoDashboardReader {
  constructor(private readonly prisma: PrismaClient) {}

  async openDeals(tenantId: string): Promise<OpenDeal[]> {
    const deals = await this.prisma.deal.findMany({
      where: { tenantId, deletedAt: null, stageKey: { in: [...OPEN_DEAL_STAGES] } },
      select: { ownerUserId: true, stageKey: true, offerAnnualValue: true },
    });
    return deals.map((deal) => ({
      ownerId: deal.ownerUserId,
      stageKey: deal.stageKey,
      annualValue: deal.offerAnnualValue ? Money.of(deal.offerAnnualValue.toFixed(2)) : null,
    }));
  }

  async revenue(query: { tenantId: string; days: { from: string; to: string }; window: { start: Date; end: Date } }): Promise<Money> {
    const sum = await this.prisma.contractPaymentHistory.aggregate({
      where: {
        tenantId: query.tenantId,
        OR: [
          // A receipt carries the day the money arrived.
          { receivedOn: { gte: utcDate(query.days.from), lte: utcDate(query.days.to) } },
          // A reversal carries none: it counts on the day it was made.
          { receivedOn: null, createdAt: { gte: query.window.start, lt: query.window.end } },
        ],
      },
      _sum: { amountReceived: true },
    });
    return money(sum._sum.amountReceived);
  }

  async monthlyRecurringValue(query: { tenantId: string; today: Date }): Promise<Money> {
    const sum = await this.prisma.contract.aggregate({
      where: { tenantId: query.tenantId, ...(validityWhere('VALID', query.today, 0) as object) },
      _sum: { amount: true },
    });
    return money(sum._sum.amount);
  }

  private async group(where: Prisma.ContractWhereInput): Promise<ContractGroup> {
    const result = await this.prisma.contract.aggregate({ where, _count: { _all: true }, _sum: { agreedAnnualValue: true } });
    return { count: result._count._all, annualValue: money(result._sum.agreedAnnualValue) };
  }

  async contracts(query: { tenantId: string; today: Date; expiringSoonDays: number }): Promise<ContractFigures> {
    const { tenantId, today, expiringSoonDays } = query;
    const [active, expired, expiringSoon] = await Promise.all([
      this.group({ tenantId, ...(validityWhere('VALID', today, expiringSoonDays) as object) }),
      this.group({ tenantId, status: ContractStatus.Expired }),
      this.group({ tenantId, ...(validityWhere('EXPIRING_SOON', today, expiringSoonDays) as object) }),
    ]);
    return { active, expired, expiringSoon };
  }

  overdueFollowUps(query: { tenantId: string; now: Date }): Promise<number> {
    return this.prisma.appointment.count({
      where: { tenantId: query.tenantId, kind: 'FOLLOW_UP', status: { in: OPEN_FOLLOW_UP }, scheduledAt: { lt: query.now } },
    });
  }

  pendingDiscountApprovals(tenantId: string): Promise<number> {
    return this.prisma.discountApproval.count({ where: { tenantId, status: 'PENDING' } });
  }

  offersWaiting(tenantId: string): Promise<number> {
    return this.prisma.quotation.count({ where: { tenantId, status: SENT } });
  }

  async companiesPerStatus(tenantId: string): Promise<CompanyStatusCount[]> {
    const rows = await this.prisma.client.groupBy({ by: ['status'], where: { tenantId, deletedAt: null }, _count: { _all: true } });
    return rows.map((row) => ({ status: row.status, count: row._count._all }));
  }
}
