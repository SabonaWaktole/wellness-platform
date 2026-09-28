import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditFilter } from '../../domain/AuditQuery';
import { IAuditEntryReader, AuditEntryView } from '../ports/IAuditEntryReader';

/** The same filtered search as the screen, unpaged, for the CSV export (FR-AUD-08). */
export class ExportAuditEntriesUseCase {
  constructor(private readonly entries: IAuditEntryReader) {}

  execute(input: { access: AccessContext; tenantId: string; filter: AuditFilter }): AsyncIterable<AuditEntryView[]> {
    input.access.ensure('audit.view');
    return this.entries.stream(input.tenantId, input.filter);
  }
}
