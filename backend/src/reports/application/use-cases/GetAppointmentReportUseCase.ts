import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import {
  IReportRepository,
  AppointmentStatusCount,
  AppointmentsByStaff,
  AppointmentReportFilters,
} from '../../domain/IReportRepository';

export interface AppointmentReport {
  byStatus: AppointmentStatusCount[];
  byStaff: AppointmentsByStaff[];
  total: number;
}

/**
 * Appointment statistics (§6.7).
 *
 * A named MVP deliverable that had no backend at all: `src/reports` contained
 * client, inventory and revenue and nothing about appointments, so the module
 * the SRS asks for could not be built on the frontend either.
 *
 * Returns both cuts in one response because the SRS asks for both ("count of
 * appointments by status" and "basic breakdown by staff member or date range")
 * and a screen showing one without the other is half a report. Two endpoints
 * would also mean two chances for the date filters to disagree.
 */
export class GetAppointmentReportUseCase {
  constructor(
    private readonly reportRepository: IReportRepository,
    private readonly scopes: RecordScopeResolver
  ) {}

  /** Over the appointments in the viewer's `calendar.view` scope (FR-RBAC-13). */
  async execute(
    tenantId: string,
    filters: Omit<AppointmentReportFilters, 'scope'>,
    access: AccessContext
  ): Promise<AppointmentReport> {
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    const scoped = { ...filters, scope: await this.scopes.resolve(access, 'calendar.view') };
    const [byStatus, byStaff] = await Promise.all([
      this.reportRepository.getAppointmentStatusDistribution(tenantId, scoped),
      this.reportRepository.getAppointmentsByStaff(tenantId, scoped),
    ]);

    return {
      byStatus,
      byStaff,
      // Summed from the status counts rather than queried again: a third count
      // could disagree with the two it is meant to total.
      total: byStatus.reduce((sum, s) => sum + s.count, 0),
    };
  }
}
