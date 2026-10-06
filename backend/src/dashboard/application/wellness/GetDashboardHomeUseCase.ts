import { AccessContext } from '../../../access/domain/AccessContext';
import { dashboardKindOf } from './dashboardContext';
import { DashboardKind } from './dashboardShape';
import { IDashboardReader } from './ports/IDashboardReader';

/** Where a user lands after login (FR-DSH-01): the dashboard of their role, or none for Reception. */
export class GetDashboardHomeUseCase {
  constructor(private readonly reader: IDashboardReader) {}

  async execute(input: { tenantId: string; access: AccessContext }): Promise<{ kind: DashboardKind }> {
    return { kind: await dashboardKindOf(this.reader, input.access, input.tenantId) };
  }
}
