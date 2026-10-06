import { ITeamRoster } from '../../../access/application/ports/ITeamRoster';
import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { RoleKey } from '../../../access/domain/RoleKey';
import { dayBoundsInZone } from '../../../shared/domain/time/tenantDay';
import { InvalidPeriodError } from '../../domain/PerformancePeriod';
import { DashboardKind } from './dashboardShape';
import { IDashboardReader, Location } from './ports/IDashboardReader';
import { IndicatorQuery } from './ports/IPerformanceReader';
import { PeriodParams, queryFor, resolveRequestedPeriod } from './performanceAudience';

/** A location that is not one of the predefined Areas and Cities. */
export class InvalidLocationError extends InvalidPeriodError {}

export const VIEW_DASHBOARD = 'dashboard.view';

/** The dashboard of each system role; a role copied from one follows it (FR-DSH-01, FR-RBAC-04). Reception has none. */
const KIND_OF: Record<string, DashboardKind> = {
  [RoleKey.SalesUser]: 'SALES_USER',
  [RoleKey.SalesManager]: 'SALES_MANAGER',
  [RoleKey.Administrator]: 'ADMINISTRATOR',
  [RoleKey.Ceo]: 'CEO',
  [RoleKey.Reception]: 'RECEPTION',
};

export async function dashboardKindOf(reader: IDashboardReader, access: AccessContext, tenantId: string): Promise<DashboardKind> {
  // The platform operator manages the workspace, as an Administrator does.
  if (access.isPlatformOperator) return 'ADMINISTRATOR';
  const lineage = await reader.roleLineage(tenantId, access.userId);
  return (lineage && KIND_OF[lineage]) || 'ADMINISTRATOR';
}

export interface DashboardParams extends PeriodParams {
  /** One salesperson of the viewer's scope; anything outside it is a 403 (FR-DSH-02). */
  salespersonId?: string;
  areaId?: string;
  cityId?: string;
}

export interface DashboardInput {
  tenantId: string;
  timezone: string;
  access: AccessContext;
  params: DashboardParams;
}

/** A viewer whose role has another dashboard cannot read this one, whatever permissions it holds (FR-DSH-01, FR-DSH-02). */
export async function ensureDashboardKind(expected: DashboardKind, reader: IDashboardReader, access: AccessContext, tenantId: string): Promise<void> {
  if ((await dashboardKindOf(reader, access, tenantId)) !== expected) throw new PermissionDeniedError(VIEW_DASHBOARD, 'This is not your dashboard.');
}

/**
 * Whose figures this dashboard reads (FR-DSH-02, FR-RBAC-23): a Sales User their own, a Sales Manager
 * the sales team, taken from the access context and the role, never from the request. A salesperson
 * asked for outside that is refused, not quietly dropped, and a viewer whose role has another
 * dashboard cannot read this one.
 */
export async function dashboardAudience(
  expected: 'SALES_USER' | 'SALES_MANAGER',
  input: DashboardInput,
  reader: IDashboardReader,
  roster: ITeamRoster
): Promise<{ allowed: string[]; selected: string[] }> {
  const { access, tenantId, params } = input;
  await ensureDashboardKind(expected, reader, access, tenantId);
  const allowed = expected === 'SALES_USER' ? [access.userId] : await roster.salesUserIds(tenantId);
  if (params.salespersonId && !allowed.includes(params.salespersonId)) {
    throw new PermissionDeniedError(VIEW_DASHBOARD, 'You cannot view the dashboard of that salesperson.');
  }
  return { allowed, selected: params.salespersonId ? [params.salespersonId] : allowed };
}

/** The Administrator and CEO dashboards cover the whole workspace and have no salesperson or location filter: asking for one is refused, not ignored (FR-DSH-02). */
export function refuseNarrowing(params: DashboardParams): void {
  if (params.salespersonId || params.areaId || params.cityId) {
    throw new InvalidLocationError('This dashboard covers the whole workspace and cannot be narrowed by salesperson or location.');
  }
}

/** A location other than the workspace's predefined Area and City is refused (FR-DSH-04). */
export async function checkedLocation(reader: IDashboardReader, tenantId: string, params: DashboardParams): Promise<Location> {
  const location: Location = { ...(params.areaId ? { areaId: params.areaId } : {}), ...(params.cityId ? { cityId: params.cityId } : {}) };
  if ((location.areaId || location.cityId) && !(await reader.locationIsPredefined(tenantId, location))) {
    throw new InvalidLocationError('Choose an Area and City from the lists.');
  }
  return location;
}

/** The period, the salespeople and "now" of one request, the same instants for every figure on the screen. */
export function dashboardWindow(input: DashboardInput, selected: readonly string[], location: Location, now: Date) {
  const { timezone, params } = input;
  const period = resolveRequestedPeriod(params, now, timezone);
  const query: IndicatorQuery = { ...queryFor(input.tenantId, timezone, now, selected, period), location };
  return {
    period,
    query,
    endOfToday: dayBoundsInZone(timezone, 0, now).end,
    endOfNext7Days: dayBoundsInZone(timezone, 7, now).end,
  };
}
