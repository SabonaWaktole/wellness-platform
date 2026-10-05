import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { admits } from '../../../access/domain/RecordScope';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { EDIT_DEALS } from '../../../deals/application/dealAccess';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { IRenewalsReader, RenewalRow, RenewalWindow } from '../ports/IRenewalsReader';

/** A row with what the viewer may do with it, decided here and not by the screen (FR-REN-05, FR-REN-08). */
export interface RenewalListing {
  row: RenewalRow;
  actions: ('START_RENEWAL' | 'MARK_NOT_RENEWING' | 'UNDO_NOT_RENEWING')[];
}

/**
 * The Renewals screen (FR-REN-05, FR-REN-09): valid contracts ending in the next
 * 30, 60 or 90 days, and Expired contracts of the last 90 days, each with its
 * renewal state (D9). Needs `contracts.validity.view`, read at the viewer's
 * scope in the query: a Sales User's own, the Sales Manager's team, All for the
 * CEO and the Administrator.
 *
 * The actions offered follow the rules of the use cases behind them:
 * START_RENEWAL needs `contracts.manage` and `deals.edit` at a scope that admits
 * the company, in a workspace that runs the sales process, and a state of Not
 * started. A Not started contract can be marked Not renewing, and a Not renewing
 * one can have the mark taken back.
 */
export class SearchRenewalsUseCase {
  constructor(
    private readonly reader: IRenewalsReader,
    private readonly scopes: RecordScopeResolver,
    private readonly tenants: ITenantRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    tenantId: string;
    timezone: string;
    access: AccessContext;
    window: RenewalWindow;
    assignedUserId?: string;
    query?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: RenewalListing[]; total: number; today: Date }> {
    const { access } = input;
    if (!access.can('contracts.validity.view')) {
      throw new PermissionDeniedError('contracts.validity.view', 'You do not have permission to view contracts.');
    }
    const [scope, manageScope, dealScope, tenant] = await Promise.all([
      this.scopes.resolve(access, 'contracts.validity.view'),
      access.can('contracts.manage') ? this.scopes.resolve(access, 'contracts.manage') : Promise.resolve(null),
      access.can(EDIT_DEALS) ? this.scopes.resolve(access, EDIT_DEALS) : Promise.resolve(null),
      this.tenants.findById(input.tenantId),
    ]);
    const today = new Date(`${dayKeyInZone(this.now(), input.timezone)}T00:00:00.000Z`);

    const { rows, total } = await this.reader.search(
      { tenantId: input.tenantId, scope, today, window: input.window, assignedUserId: input.assignedUserId, query: input.query?.trim() || undefined },
      { page: input.page, limit: input.limit }
    );

    const salesProcess = tenant?.runsSalesProcess() ?? false;
    return {
      today,
      total,
      rows: rows.map((row) => {
        const actions: RenewalListing['actions'] = [];
        // A contract belongs to its company's salesperson (FR-RBAC-11), for reading and for writing.
        const owner = row.clientAssignedUserId;
        const canManage = manageScope !== null && admits(manageScope, owner);
        if (canManage && row.state === 'NOT_STARTED') {
          actions.push('MARK_NOT_RENEWING');
          if (salesProcess && dealScope !== null && admits(dealScope, owner)) actions.unshift('START_RENEWAL');
        }
        if (canManage && row.state === 'NOT_RENEWING') actions.push('UNDO_NOT_RENEWING');
        return { row, actions };
      }),
    };
  }
}
