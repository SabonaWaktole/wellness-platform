import { RecordScope } from '../../access/domain/RecordScope';

export interface MonthlyRevenue {
  month: string; // e.g., '2026-07'
  revenue: number;
}

export interface ClientStatusCount {
  status: string;
  count: number;
}

export interface WarehouseInventoryValue {
  warehouseName: string;
  totalItems: number;
  totalValue: number;
}

/** One bucket of the new-client trend (§6.7, "new clients added over a period"). */
export interface NewClientsPoint {
  month: string; // '2026-07'
  count: number;
}

/** §6.7: "count of appointments by status". */
export interface AppointmentStatusCount {
  status: string;
  count: number;
}

/** §6.7: "basic breakdown by staff member". */
export interface AppointmentsByStaff {
  userId: string;
  staffName: string;
  scheduled: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  total: number;
}

/**
 * One product that is short at one location.
 *
 * Per-warehouse rather than per-product, because §6.4 asks for availability to
 * be evaluated per location "so a business can see exactly where a shortage
 * exists" — a company-wide total hides a warehouse with nothing on the shelf
 * behind another that is overstocked.
 */
export interface LowStockItem {
  productId: string;
  productName: string;
  sku: string | null;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  threshold: number;
  status: 'OUT_OF_STOCK' | 'LOW_STOCK';
}

export interface AppointmentReportFilters {
  from?: Date;
  to?: Date;
  assignedUserId?: string;
  /** The viewer's `calendar.view` reach over the appointment's assignee. */
  scope?: RecordScope;
}

/**
 * `scope` below is the viewer's reach over the company's (or appointment's)
 * assignee (FR-RBAC-13). Omitted means the whole tenant. Inventory has no
 * per-user owner, so its reports take none.
 */
export interface IReportRepository {
  getMonthlyRevenue(tenantId: string, limitMonths?: number, scope?: RecordScope): Promise<MonthlyRevenue[]>;
  getClientStatusDistribution(tenantId: string, scope?: RecordScope): Promise<ClientStatusCount[]>;
  getInventoryValueByWarehouse(tenantId: string): Promise<WarehouseInventoryValue[]>;

  getNewClientsTrend(tenantId: string, limitMonths: number, scope?: RecordScope): Promise<NewClientsPoint[]>;

  getAppointmentStatusDistribution(
    tenantId: string,
    filters: AppointmentReportFilters
  ): Promise<AppointmentStatusCount[]>;

  getAppointmentsByStaff(
    tenantId: string,
    filters: AppointmentReportFilters
  ): Promise<AppointmentsByStaff[]>;

  getLowStockItems(tenantId: string): Promise<LowStockItem[]>;
}
