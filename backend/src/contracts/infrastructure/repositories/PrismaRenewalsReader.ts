import { Prisma, PrismaClient } from '@prisma/client';
import { ownerWhere } from '../../../access/infrastructure/prismaRecordScope';
import { insensitiveContains } from '../../../shared/infrastructure/prisma/caseInsensitiveFilter';
import { Money } from '../../../pricing/domain/Money';
import { ContractStatus } from '../../domain/Contract';
import { addDays } from '../../domain/calendarDay';
import { contractReference } from '../../domain/contractReference';
import { renewalStateOf } from '../../domain/renewalState';
import { IRenewalsReader, RECENTLY_EXPIRED_DAYS, RenewalFilters, RenewalRow } from '../../application/ports/IRenewalsReader';
import { validityWhere } from './contractValidityWhere';

const person = (user: { id: string; firstName: string | null; lastName: string | null } | null | undefined) =>
  user ? { id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.id } : null;

const ROW_SELECT = (tenantId: string) =>
  ({
    id: true,
    number: true,
    planName: true,
    status: true,
    startsAt: true,
    endsAt: true,
    amount: true,
    notRenewingReasonId: true,
    notRenewingNote: true,
    notRenewingReason: { select: { nameSq: true, nameEn: true } },
    assignedUser: { select: { id: true, firstName: true, lastName: true } },
    client: { select: { id: true, name: true, assignedUser: { select: { id: true, firstName: true, lastName: true } } } },
    renewedInto: { select: { id: true, number: true } },
    // The same "open" as the one-open-renewal rule (D9): not deleted, not Won, not Lost.
    renewalDeals: { where: { tenantId, deletedAt: null, stageKey: { notIn: ['WON', 'LOST'] } }, select: { id: true }, take: 1 },
  }) satisfies Prisma.ContractSelect;

export class PrismaRenewalsReader implements IRenewalsReader {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * "Valid and ending within N days" is `validityOn` for the window (the same predicate as the
   * contract list); "Recently expired" is Expired with an end date in the last 90 days.
   */
  private where(filters: RenewalFilters): Prisma.ContractWhereInput {
    const { today, window } = filters;
    const and: Prisma.ContractWhereInput[] = [{ client: ownerWhere(filters.scope, 'assignedUserId') }];

    if (window === 'RECENTLY_EXPIRED') {
      and.push({ status: ContractStatus.Expired, endsAt: { gte: addDays(today, -RECENTLY_EXPIRED_DAYS), lt: today } });
    } else {
      const days = Number(window);
      and.push({ ...(validityWhere('VALID', today, 0) as Prisma.ContractWhereInput), endsAt: { gte: today, lt: addDays(today, days + 1) } });
    }
    if (filters.query) {
      and.push({ OR: [{ number: insensitiveContains(filters.query) }, { client: { name: insensitiveContains(filters.query) } }] });
    }
    if (filters.assignedUserId) {
      and.push({
        OR: [
          { assignedUserId: filters.assignedUserId },
          { assignedUserId: null, client: { assignedUserId: filters.assignedUserId } },
        ],
      });
    }
    return { tenantId: filters.tenantId, AND: and };
  }

  async search(filters: RenewalFilters, page: { page: number; limit: number }) {
    const where = this.where(filters);
    const [total, rows] = await Promise.all([
      this.prisma.contract.count({ where }),
      this.prisma.contract.findMany({
        where,
        select: ROW_SELECT(filters.tenantId),
        // Soonest end first; the contracts that ended most recently first on "Recently expired".
        orderBy: [{ endsAt: filters.window === 'RECENTLY_EXPIRED' ? 'desc' : 'asc' }, { id: 'asc' }],
        skip: (page.page - 1) * page.limit,
        take: page.limit,
      }),
    ]);

    return {
      total,
      rows: rows.map((row): RenewalRow => {
        const notRenewing = row.notRenewingReasonId
          ? {
              reasonId: row.notRenewingReasonId,
              reasonSq: row.notRenewingReason?.nameSq ?? '',
              reasonEn: row.notRenewingReason?.nameEn ?? null,
              note: row.notRenewingNote,
            }
          : null;
        const openDealId = row.renewalDeals[0]?.id ?? null;
        return {
          contractId: row.id,
          // A contract made before numbers keeps its UUID-based reference (TD-021).
          number: row.number ?? contractReference(row.id),
          planName: row.planName,
          status: row.status,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          client: { id: row.client.id, name: row.client.name ?? '' },
          salesperson: person(row.assignedUser) ?? person(row.client.assignedUser),
          clientAssignedUserId: row.client.assignedUser?.id ?? null,
          monthlyPrice: Money.of(row.amount.toString()),
          state: renewalStateOf({ notRenewing: notRenewing !== null, renewed: row.renewedInto !== null, openDeal: openDealId !== null }),
          notRenewing,
          renewedInto: row.renewedInto ? { id: row.renewedInto.id, number: row.renewedInto.number ?? contractReference(row.renewedInto.id) } : null,
          openDealId,
        };
      }),
    };
  }
}
