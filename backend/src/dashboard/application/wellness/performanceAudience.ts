import { ITeamRoster } from '../../../access/application/ports/ITeamRoster';
import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { PermissionScope } from '../../../access/domain/PermissionScope';
import { DayRange, InstantRange, instantsOf, PeriodPreset, previousPeriod, resolvePeriod, workspaceToday } from '../../domain/PerformancePeriod';
import { IndicatorQuery } from './ports/IPerformanceReader';

export const VIEW_PERFORMANCE = 'performance.view';

export interface PeriodParams {
  preset: PeriodPreset;
  from?: string;
  to?: string;
}

/**
 * Whose figures a viewer may read (FR-PRF-01, FR-RBAC-23). Own is the viewer alone; Team and All
 * are every Sales User of the workspace, deactivated ones included (they keep their history,
 * FR-PRF-05). The scope comes from the access context, never from a request parameter: a salesperson
 * outside it is refused with 403, not filtered away without a word.
 */
export async function performanceAudience(
  access: AccessContext,
  roster: ITeamRoster,
  tenantId: string,
  requested?: readonly string[]
): Promise<{ allowed: string[]; selected: string[]; ownOnly: boolean }> {
  access.ensure(VIEW_PERFORMANCE, 'You do not have permission to view performance.');
  const ownOnly = access.scopeOf(VIEW_PERFORMANCE) === PermissionScope.Own;
  const allowed = ownOnly ? [access.userId] : await roster.salesUserIds(tenantId);
  const outside = (requested ?? []).filter((id) => !allowed.includes(id));
  if (outside.length > 0) {
    throw new PermissionDeniedError(VIEW_PERFORMANCE, 'You cannot view the performance of that salesperson.');
  }
  const selected = requested && requested.length > 0 ? [...new Set(requested)] : allowed;
  return { allowed, selected, ownOnly };
}

export interface ResolvedPeriod {
  days: DayRange;
  window: InstantRange;
  previous: { days: DayRange; window: InstantRange };
}

/** The days a request asks for, as workspace days and as instants, with the period to compare to. */
export function resolveRequestedPeriod(params: PeriodParams, now: Date, timezone: string): ResolvedPeriod {
  const today = workspaceToday(now, timezone);
  const days = resolvePeriod(params.preset, today, params.from && params.to ? { from: params.from, to: params.to } : undefined);
  const before = previousPeriod(params.preset, days);
  return {
    days,
    window: instantsOf(days, timezone),
    previous: { days: before, window: instantsOf(before, timezone) },
  };
}

export const queryFor = (
  tenantId: string,
  timezone: string,
  now: Date,
  salespersonIds: readonly string[],
  period: { days: DayRange; window: InstantRange }
): IndicatorQuery => ({ tenantId, salespersonIds, days: period.days, window: period.window, timezone, now });
