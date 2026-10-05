import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { PaymentStatus } from '../../domain/ContractPayment';
import { IPaymentOverviewReader, PaymentOverviewFilters } from '../ports/IPaymentOverviewReader';

/** What the overview and the export are filtered by, as the route parsed it (FR-PAY-11). */
export interface PaymentSearchParams {
  status?: PaymentStatus;
  clientId?: string;
  assignedUserId?: string;
  contractId?: string;
  query?: string;
  /** `YYYY-MM-DD`, both ends included. */
  dueFrom?: string;
  dueTo?: string;
  dueNotInvoiced?: boolean;
  areaId?: string;
  cityId?: string;
}

interface Input {
  tenantId: string;
  /** The workspace's time zone: "today" is its day (M3 D4). */
  timezone: string;
  access: AccessContext;
  params: PaymentSearchParams;
}

const day = (value: string | undefined): Date | undefined => (value ? new Date(`${value}T00:00:00.000Z`) : undefined);

/**
 * The Payments overview and its CSV export (FR-PAY-11, FR-PAY-14, FR-AUD-13).
 *
 * Both need `payments.view` and read the same scope: Sales User Own, Sales
 * Manager Team, CEO and authorised payment users All, narrowed in the query
 * (FR-RBAC-22). The permission is checked here as well as on the route, so a
 * use case called from elsewhere is still refused.
 */
class PaymentsOverview {
  constructor(
    protected readonly reader: IPaymentOverviewReader,
    protected readonly scopes: RecordScopeResolver,
    protected readonly now: () => Date = () => new Date()
  ) {}

  protected async filters(input: Input): Promise<PaymentOverviewFilters> {
    if (!input.access.can('payments.view')) {
      throw new PermissionDeniedError('payments.view', 'You do not have permission to view payments.');
    }
    const { params } = input;
    return {
      tenantId: input.tenantId,
      scope: await this.scopes.resolve(input.access, 'payments.view'),
      today: day(dayKeyInZone(this.now(), input.timezone))!,
      status: params.status,
      clientId: params.clientId,
      assignedUserId: params.assignedUserId,
      contractId: params.contractId,
      query: params.query?.trim() || undefined,
      dueFrom: day(params.dueFrom),
      dueTo: day(params.dueTo),
      dueNotInvoiced: params.dueNotInvoiced,
      areaId: params.areaId,
      cityId: params.cityId,
    };
  }
}

export class SearchPaymentsUseCase extends PaymentsOverview {
  async execute(input: Input & { page: number; limit: number }) {
    const filters = await this.filters(input);
    const result = await this.reader.search(filters, { page: input.page, limit: input.limit });
    return { ...result, today: filters.today };
  }
}

/** Rows an export will include at most. A larger result is refused, not cut short. */
export const MAX_EXPORT_ROWS = 20_000;
const BATCH = 1_000;

export class ExportPaymentsUseCase extends PaymentsOverview {
  constructor(
    reader: IPaymentOverviewReader,
    scopes: RecordScopeResolver,
    private readonly audit: IAuditTrail,
    now?: () => Date
  ) {
    super(reader, scopes, now);
  }

  /**
   * Writes the audit entry (who, when and the filters used, FR-AUD-13) before
   * any row is handed over, so an export that happened is always on record and
   * one that could not be recorded does not happen. Then yields the rows in batches.
   */
  async execute(input: Input & { actingUserId: string }) {
    const filters = await this.filters(input);
    const { total } = await this.reader.search(filters, { page: 1, limit: 1 });
    if (total > MAX_EXPORT_ROWS) {
      throw new Error(`The export would have ${total} rows; narrow the filters to ${MAX_EXPORT_ROWS} or fewer.`);
    }

    await this.audit.record({
      tenantId: input.tenantId,
      userId: input.actingUserId,
      userRole: input.access.auditRole,
      action: AuditAction.Export,
      entityType: 'ContractPayment',
      entityId: 'export',
      entityLabel: 'Payments export',
      changes: [
        { field: 'rows', old: null, new: total },
        ...Object.entries(input.params)
          .filter(([, value]) => value !== undefined && value !== '')
          .map(([field, value]) => ({ field: `filter.${field}`, old: null, new: value })),
      ],
    });

    return { rows: this.reader.exportRows(filters, BATCH), today: filters.today };
  }
}
