import { IClientRepository } from '../../../clients/domain/repositories/IClientRepository';
import { INotificationSettingsRepository } from '../../../notifications/domain/INotificationSettingsRepository';
import { dayBoundsInZone } from '@shared/domain/time/tenantDay';
import { Client } from '../../../clients/domain/entities/Client';
import { prisma } from '../../../shared/infrastructure/prisma/client';

export interface GetTenantClientMetricsDTO {
  tenantId: string;
  /**
   * The tenant's configured IANA timezone. Day buckets below are resolved in
   * it, so "Appointments Today" means the tenant's today rather than the
   * server host's. See tenantDay.ts for the defect this closes.
   */
  timeZone: string;
  /** The requesting user. Only used when their scope restricts them to own data. */
  userId?: string;
  /** @deprecated pass `scope` instead — kept for callers not yet on Slice 3's AccessContext. */
  role?: string;
  /**
   * Slice 3 (FR-RBAC replacing the `role === 'STAFF'` literal): the caller's
   * `companies.view` scope, from `access.scopeOf('companies.view')`. `OWN`
   * sees only their own figures; anything else (including unset, for a
   * caller not yet passing this) is tenant-wide, same as `role` did.
   */
  scope?: string | null;
}

export interface TenantClientMetrics {
  totalClients: number;
  totalClientsLastWeek: number;
  /**
   * Clients whose `assignedUserId` is the requesting user — their own book of
   * business. Always personal, for every role: the card that renders it is
   * titled "My assigned clients", and a tenant-wide figure under that label
   * would be a different number than the words promise. 0 when the caller is
   * anonymous (no userId), which no authenticated route produces.
   */
  assignedClients: number;
  /**
   * Sent quotations still waiting on a customer past the workspace's follow-up
   * period — the rep's standing "chase these" list.
   */
  openFollowUps: number;
  /**
   * The period behind `openFollowUps`, in days, so the UI can say what "open"
   * means instead of showing a bare count against an invisible rule.
   */
  followUpThresholdDays: number;
  /** Appointments scheduled for today, excluding cancelled ones. */
  appointmentsToday: number;
  /** Same window yesterday, so the card can show a real day-over-day delta. */
  appointmentsYesterday: number;
  /** Quotations still in flight — neither accepted, rejected nor expired. */
  openQuotations: number;
  /** Of those, the ones sitting in PENDING_APPROVAL and waiting on someone. */
  quotationsAwaitingApproval: number;
  /** Products at or below their low-stock threshold across all warehouses. */
  lowStockProducts: number;
  /** Of those, the ones that are completely out of stock. */
  outOfStockProducts: number;
}

/**
 * Quotations that still need someone to act on them. ACCEPTED / REJECTED /
 * EXPIRED are terminal, so they are excluded.
 */
const OPEN_QUOTATION_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'SENT'];

/** A cancelled appointment is not something the day's count should include. */
const ACTIVE_APPOINTMENT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'COMPLETED'];

/*
 * `dayBounds` used to be `new Date(); setHours(0,0,0,0)` — midnight in the
 * SERVER HOST's timezone. That silently disagreed with the calendar, which
 * bucketed by the browser's timezone: with the host on UTC+3 and a user on
 * UTC+2, a 21:30Z appointment was counted "today" here and drawn on the next
 * day there. Both now resolve through the tenant's zone.
 */

export class GetTenantClientMetricsUseCase {
  constructor(
    private clientRepository: IClientRepository,
    /**
     * Read for one field: `quotationFollowUpDays`. "Open follow-up" has to mean
     * the same thing here as it does to QuotationFollowUpJob, and that period is
     * a per-workspace setting, so the dashboard reads the setting rather than
     * hard-coding a second, quietly different threshold.
     */
    private settingsRepository: INotificationSettingsRepository
  ) {}

  async execute(dto: GetTenantClientMetricsDTO): Promise<TenantClientMetrics> {
    const { tenantId } = dto;

    // Role-based visibility, matching GetUpcomingAppointmentsUseCase: STAFF see
    // only figures for records they own, BUSINESS_OWNER sees the whole tenant.
    //
    // Ownership differs per entity, so each aggregate below uses its own field:
    // Client.assignedUserId, Appointment.assignedUserId, Quotation.createdByUserId.
    // Product and StockLevel have NO user-ownership column at all — stock is a
    // property of the warehouse, not of a person — so the low/out-of-stock
    // counts stay tenant-wide for every role. That is a real limit of the data
    // model, not an oversight: there is nothing to scope those numbers by.
    const scopedUserId = dto.scope === 'OWN' || dto.role === 'STAFF' ? dto.userId : undefined;

    // Scoped counts come from search().total, since countByTenant() takes no
    // user filter.
    const result = await this.clientRepository.search(
      tenantId,
      scopedUserId ? { assignedUserId: scopedUserId } : {},
      0,
      10000
    );
    const allClients = result.items;

    const totalClients = scopedUserId
      ? result.total
      : await this.clientRepository.countByTenant(tenantId);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const totalClientsLastWeek = allClients.filter((c: Client) => c.createdAt < oneWeekAgo).length;

    const today = dayBoundsInZone(dto.timeZone, 0);
    const yesterday = dayBoundsInZone(dto.timeZone, -1);

    /*
     * The follow-up window, straight from the workspace's notification policy.
     *
     * `quotationFollowUpEnabled` is deliberately NOT consulted. That flag
     * governs whether we *email* a reminder; a quotation a customer has ignored
     * for a week is outstanding work either way, and a workspace that turned
     * the mail off has not thereby cleared its pipeline. Turning the switch off
     * should quiet the inbox, not empty the dashboard card.
     *
     * A tenant that has never opened the settings page has no row, and the
     * repository answers with NotificationSettings.defaults() — so this is
     * never undefined and needs no fallback here.
     */
    const settings = await this.settingsRepository.get(tenantId);
    const followUpThresholdDays = settings.quotationFollowUpDays;
    const followUpCutoff = new Date(Date.now() - followUpThresholdDays * 24 * 60 * 60_000);

    // Counted directly through Prisma rather than via repositories: these are
    // read-only aggregates for a dashboard, and adding count methods to three
    // separate domain repositories would be a lot of plumbing for numbers that
    // never re-enter the domain. Every query is scoped by tenantId.
    const [
      assignedClients,
      appointmentsToday,
      appointmentsYesterday,
      openQuotations,
      openFollowUps,
      quotationsAwaitingApproval,
      stockByProduct,
      products,
    ] = await Promise.all([
      // Personal for every role — see the field's note on TenantClientMetrics.
      // Guarded rather than passed straight through: `assignedUserId: undefined`
      // is not a filter to Prisma, so an anonymous caller would silently get
      // every client in the tenant under a card titled "My assigned clients".
      dto.userId
        ? prisma.client.count({ where: { tenantId, assignedUserId: dto.userId, deletedAt: null } })
        : Promise.resolve(0),
      prisma.appointment.count({
        where: {
          tenantId,
          ...(scopedUserId ? { assignedUserId: scopedUserId } : {}),
          status: { in: ACTIVE_APPOINTMENT_STATUSES },
          scheduledAt: { gte: today.start, lt: today.end },
        },
      }),
      prisma.appointment.count({
        where: {
          tenantId,
          ...(scopedUserId ? { assignedUserId: scopedUserId } : {}),
          status: { in: ACTIVE_APPOINTMENT_STATUSES },
          scheduledAt: { gte: yesterday.start, lt: yesterday.end },
        },
      }),
      prisma.quotation.count({
        where: {
          tenantId,
          ...(scopedUserId ? { createdByUserId: scopedUserId } : {}),
          status: { in: OPEN_QUOTATION_STATUSES },
        },
      }),
      /*
       * Open follow-ups: sent, unanswered, and older than the workspace's
       * follow-up period. The same selection PrismaSchedulerQueries.findStale
       * makes, minus its `followUpSentAt: null` filter — that column exists to
       * stop the job chasing twice, and a quotation does not stop needing a
       * chase because one reminder already went out. This card is the worklist,
       * not the job's ledger.
       */
      prisma.quotation.count({
        where: {
          tenantId,
          ...(scopedUserId ? { createdByUserId: scopedUserId } : {}),
          status: 'SENT',
          respondedAt: null,
          sentAt: { not: null, lte: followUpCutoff },
        },
      }),
      prisma.quotation.count({
        where: {
          tenantId,
          ...(scopedUserId ? { createdByUserId: scopedUserId } : {}),
          status: 'PENDING_APPROVAL',
        },
      }),
      // Stock lives per warehouse, but "low stock" is a property of the
      // product as a whole, so totals are summed across warehouses first.
      prisma.stockLevel.groupBy({
        by: ['productId'],
        where: { tenantId },
        _sum: { quantity: true },
      }),
      prisma.product.findMany({
        where: { tenantId },
        select: { id: true, lowStockThreshold: true },
      }),
    ]);

    const quantityByProduct = new Map(
      stockByProduct.map((row: any) => [row.productId, row._sum?.quantity ?? 0])
    );

    let lowStockProducts = 0;
    let outOfStockProducts = 0;
    for (const product of products) {
      // A product with no StockLevel rows at all has never been stocked
      // anywhere, which counts as out of stock rather than as "unknown".
      const quantity = Number(quantityByProduct.get(product.id) ?? 0);
      if (quantity <= 0) {
        outOfStockProducts += 1;
        lowStockProducts += 1;
      } else if (quantity <= product.lowStockThreshold) {
        lowStockProducts += 1;
      }
    }

    return {
      totalClients,
      totalClientsLastWeek,
      assignedClients,
      openFollowUps,
      followUpThresholdDays,
      appointmentsToday,
      appointmentsYesterday,
      openQuotations,
      quotationsAwaitingApproval,
      lowStockProducts,
      outOfStockProducts,
    };
  }
}
