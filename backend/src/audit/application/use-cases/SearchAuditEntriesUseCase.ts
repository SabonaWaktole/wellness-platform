import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditQuery } from '../../domain/AuditQuery';
import { IAuditEntryReader, AuditEntryPage } from '../ports/IAuditEntryReader';

/**
 * The audit log viewer's search (FR-AUD-06): filter by date range, user,
 * entity type and action, newest first, paginated. Administrator and CEO
 * only — everyone else is refused before the query ever runs.
 */
export class SearchAuditEntriesUseCase {
  constructor(private readonly entries: IAuditEntryReader) {}

  async execute(input: { access: AccessContext; tenantId: string; query: AuditQuery }): Promise<AuditEntryPage> {
    input.access.ensure('audit.view');
    return this.entries.search(input.tenantId, input.query);
  }
}
