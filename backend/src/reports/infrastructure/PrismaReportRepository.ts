import { PrismaClient, Prisma } from '@prisma/client';
import { IS_MYSQL } from '../../shared/infrastructure/prisma/provider';
import {
  IReportRepository,
  MonthlyRevenue,
  ClientStatusCount,
  WarehouseInventoryValue,
  NewClientsPoint,
  AppointmentStatusCount,
  AppointmentsByStaff,
  AppointmentReportFilters,
  LowStockItem,
} from '../domain/IReportRepository';

export class PrismaReportRepository implements IReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getMonthlyRevenue(tenantId: string, limitMonths: number = 12): Promise<MonthlyRevenue[]> {
    const d = new Date();
    d.setMonth(d.getMonth() - limitMonths);

    // Prisma doesn't have a direct "group by month" function for sum that works across all DBs easily, 
    // so we can either use raw SQL or pull the recent quotations and aggregate in memory.
    // For simplicity and DB agnosticism, we will fetch and aggregate in memory.
    const quotations = await this.prisma.quotation.findMany({
      where: {
        tenantId,
        status: { in: ['ACCEPTED', 'WON'] },
        createdAt: { gte: d }
      },
      include: {
        lineItems: true
      }
    });

    const monthlyMap: Record<string, number> = {};

    for (const q of quotations) {
      /*
       * DELIBERATELY UTC — do not "fix" this to the tenant's timezone.
       *
       * A financial reporting period must have a boundary that is fixed once
       * the period exists. If months were bucketed in `tenant.timezone`, then
       * changing that setting would retroactively move revenue between months:
       * a quotation created at 23:30 UTC on 31 January would silently become
       * February revenue the moment someone moved the workspace east, and a
       * previously published figure would no longer reconcile.
       *
       * This is a permanent guarantee, not a shortcut taken for expedience.
       * The DAILY buckets on the dashboard DO follow the tenant zone (see
       * shared/domain/time/tenantDay.ts) because "appointments today" is a
       * question about the user's current day; "revenue in January" is a
       * question about a closed accounting period. The two differ on purpose.
       */
      const monthStr = q.createdAt.toISOString().slice(0, 7); // YYYY-MM, UTC
      if (!monthlyMap[monthStr]) {
        monthlyMap[monthStr] = 0;
      }
      
      const totalValue = q.lineItems.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
      monthlyMap[monthStr] += totalValue;
    }

    // Convert map to array and sort
    const result: MonthlyRevenue[] = Object.entries(monthlyMap)
      .map(([month, revenue]) => ({ month, revenue }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return result;
  }

  async getClientStatusDistribution(tenantId: string): Promise<ClientStatusCount[]> {
    const counts = await this.prisma.client.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: {
        id: true
      }
    });

    return counts.map(c => ({
      status: c.status,
      count: c._count.id
    }));
  }

  async getInventoryValueByWarehouse(tenantId: string): Promise<WarehouseInventoryValue[]> {
    const warehouses = await this.prisma.warehouse.findMany({
      where: { tenantId },
      include: {
        stockLevels: {
          include: {
            product: true
          }
        }
      }
    });

    return warehouses.map(w => {
      let totalItems = 0;
      let totalValue = 0;

      for (const stock of w.stockLevels) {
        totalItems += stock.quantity;
        totalValue += stock.quantity * stock.product.price;
      }

      return {
        warehouseName: w.name,
        totalItems,
        totalValue
      };
    });
  }

  /**
   * New clients per month (§6.7, "trend view of new clients added").
   *
   * Grouped in SQL rather than by pulling rows and bucketing in JS, unlike
   * `getMonthlyRevenue` above. That method's comment chose "simplicity and DB
   * agnosticism"; a growth chart that loads every client the workspace has ever
   * had in order to count them is the shape of query §4.7 warns about.
   *
   * `date_trunc` then `to_char` rather than a single formatting call: the
   * truncation is what makes rows in the same month group together, and the
   * formatting only names the resulting bucket. Identifiers are double-quoted
   * because Prisma creates them camelCase, which Postgres would otherwise fold
   * to lowercase and fail to find. MySQL needs neither — `DATE_FORMAT` both
   * truncates and formats in one call, and MySQL's `DATETIME` columns (unlike
   * Postgres `timestamp`) carry no implicit session-timezone conversion on
   * read, so the value already IS the UTC wall-clock time it was written as;
   * no `AT TIME ZONE` equivalent is needed to anchor it.
   *
   * Bucketed in UTC, matching `getMonthlyRevenue` above — see the long comment
   * there for why a reporting period must not follow the tenant timezone.
   *
   * Months with no signups are filled in below rather than omitted, so the
   * chart shows a flat stretch instead of silently compressing time.
   */
  async getNewClientsTrend(tenantId: string, limitMonths: number): Promise<NewClientsPoint[]> {
    const start = startOfMonthsAgo(limitMonths - 1);

    const query = IS_MYSQL
      ? Prisma.sql`
          SELECT DATE_FORMAT(\`createdAt\`, '%Y-%m') AS month,
                 COUNT(*)                             AS count
          FROM \`Client\`
          WHERE \`tenantId\` = ${tenantId}
            AND \`createdAt\` >= ${start}
          GROUP BY 1
          ORDER BY 1
        `
      : Prisma.sql`
          SELECT to_char(date_trunc('month', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
                 COUNT(*)                                                                AS count
          FROM "Client"
          WHERE "tenantId" = ${tenantId}
            AND "createdAt" >= ${start}
          GROUP BY 1
          ORDER BY 1
        `;

    const rows = await this.prisma.$queryRaw<{ month: string; count: bigint }[]>(query);

    const counts = new Map(rows.map((r) => [r.month, Number(r.count)]));

    const series: NewClientsPoint[] = [];
    for (let i = limitMonths - 1; i >= 0; i--) {
      const month = monthKey(startOfMonthsAgo(i));
      series.push({ month, count: counts.get(month) ?? 0 });
    }
    return series;
  }

  async getAppointmentStatusDistribution(
    tenantId: string,
    filters: AppointmentReportFilters
  ): Promise<AppointmentStatusCount[]> {
    const counts = await this.prisma.appointment.groupBy({
      by: ['status'],
      where: this.appointmentWhere(tenantId, filters),
      _count: { id: true },
    });

    return counts.map((c) => ({ status: c.status, count: c._count.id }));
  }

  async getAppointmentsByStaff(
    tenantId: string,
    filters: AppointmentReportFilters
  ): Promise<AppointmentsByStaff[]> {
    const counts = await this.prisma.appointment.groupBy({
      by: ['assignedUserId', 'status'],
      where: this.appointmentWhere(tenantId, filters),
      _count: { id: true },
    });

    if (counts.length === 0) return [];

    // One lookup for the names rather than a join per group: groupBy cannot
    // include a relation, and N queries for N staff is the classic version of
    // this mistake.
    const userIds = [...new Set(counts.map((c) => c.assignedUserId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const nameById = new Map(
      users.map((u) => [
        u.id,
        [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email,
      ])
    );

    const byUser = new Map<string, AppointmentsByStaff>();
    for (const row of counts) {
      const entry =
        byUser.get(row.assignedUserId) ??
        {
          userId: row.assignedUserId,
          staffName: nameById.get(row.assignedUserId) ?? 'Unknown',
          scheduled: 0,
          confirmed: 0,
          completed: 0,
          cancelled: 0,
          total: 0,
        };

      const n = row._count.id;
      if (row.status === 'SCHEDULED') entry.scheduled += n;
      else if (row.status === 'CONFIRMED') entry.confirmed += n;
      else if (row.status === 'COMPLETED') entry.completed += n;
      else if (row.status === 'CANCELLED') entry.cancelled += n;
      entry.total += n;

      byUser.set(row.assignedUserId, entry);
    }

    return [...byUser.values()].sort((a, b) => b.total - a.total);
  }

  /**
   * Products short at a specific location (§6.7 list, §6.4 per-location rule).
   *
   * Evaluated per StockLevel row, so a product held in three warehouses can
   * appear three times — once for each place it is actually short. The
   * dashboard's own low-stock card still sums across warehouses, which answers
   * a different question ("how many products need attention"); this answers
   * "where do I need to restock".
   *
   * Products with no StockLevel rows at all are absent by construction. That is
   * correct here: a service with no stock anywhere is not "short at a
   * warehouse", and listing it under every location would be noise.
   */
  async getLowStockItems(tenantId: string): Promise<LowStockItem[]> {
    const rows = await this.prisma.stockLevel.findMany({
      where: { tenantId },
      select: {
        quantity: true,
        warehouseId: true,
        warehouse: { select: { name: true } },
        productId: true,
        product: { select: { name: true, sku: true, lowStockThreshold: true } },
      },
    });

    return rows
      .filter((r) => r.quantity <= r.product.lowStockThreshold)
      .map((r) => ({
        productId: r.productId,
        productName: r.product.name,
        sku: r.product.sku,
        warehouseId: r.warehouseId,
        warehouseName: r.warehouse.name,
        quantity: r.quantity,
        threshold: r.product.lowStockThreshold,
        status: (r.quantity <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK') as LowStockItem['status'],
      }))
      // Emptiest first: the list is a work queue, so what is already out of
      // stock belongs above what is merely running low.
      .sort((a, b) => a.quantity - b.quantity || a.productName.localeCompare(b.productName));
  }

  /** Shared filter for both appointment reports, so they cannot diverge. */
  private appointmentWhere(tenantId: string, filters: AppointmentReportFilters) {
    const where: Record<string, unknown> = { tenantId };

    if (filters.from || filters.to) {
      where.scheduledAt = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }
    if (filters.assignedUserId) where.assignedUserId = filters.assignedUserId;

    return where;
  }
}

/** UTC month boundary `n` months back. Matches getMonthlyRevenue's UTC choice. */
function startOfMonthsAgo(n: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1));
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
