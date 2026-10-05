import { LostDeal, OpenDeal } from '../../../domain/DashboardDefinitions';
import { IndicatorQuery } from './IPerformanceReader';

export interface Location {
  areaId?: string;
  cityId?: string;
}

export interface FollowUpCounts {
  /** Open, due later today. */
  dueToday: number;
  /** Open, due after today and within the next 7 days. */
  dueNext7Days: number;
  /** Open and past their due time. */
  overdue: number;
}

export interface LostReasonName {
  id: string;
  nameSq: string;
  nameEn: string | null;
}

export interface DashboardOwnerQuery {
  tenantId: string;
  /** Already inside the viewer's scope. */
  salespersonIds: readonly string[];
  location?: Location;
}

/**
 * The reads behind the Sales User and Sales Manager dashboards (FR-DSH-09, 10) that the Performance
 * indicators do not already give. Salespeople are already inside the viewer's scope (FR-RBAC-23).
 */
export interface IDashboardReader {
  /** Open deals with the annual value of their latest offer, as of now. */
  openDeals(query: DashboardOwnerQuery): Promise<OpenDeal[]>;
  /** Deals lost in the period, by the owner when they were lost, with the predefined reason (D13). */
  lostDeals(query: IndicatorQuery): Promise<Array<LostDeal & { ownerId: string }>>;
  followUps(query: DashboardOwnerQuery & { now: Date; endOfToday: Date; endOfNext7Days: Date }): Promise<Map<string, FollowUpCounts>>;
  /** Valid contracts ending within the expiring-soon window, per responsible salesperson (Should). */
  contractsExpiringSoon(query: DashboardOwnerQuery & { today: Date; windowDays: number }): Promise<Map<string, number>>;
  /** Overdue instalments of the salesperson's contracts (Should). */
  overdueInstalments(query: DashboardOwnerQuery): Promise<Map<string, number>>;
  /** Discount approvals still waiting on an offer by one of these salespeople (Should). */
  pendingDiscountApprovals(query: DashboardOwnerQuery): Promise<number>;
  lostReasons(tenantId: string): Promise<LostReasonName[]>;
  /** True when each id given is a predefined Area or City of the workspace, and the city is in the area (FR-DSH-04). */
  locationIsPredefined(tenantId: string, location: Location): Promise<boolean>;
  /** The system role the user's role descends from, or `null` for the platform operator (FR-DSH-01). */
  roleLineage(tenantId: string, userId: string): Promise<string | null>;
}
