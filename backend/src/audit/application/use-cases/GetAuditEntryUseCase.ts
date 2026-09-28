import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditEntryNotFoundError } from '../../domain/errors';
import { IAuditEntryReader, AuditEntryView } from '../ports/IAuditEntryReader';

/** Opens one entry in the detail drawer: the full field / before / after list (FR-AUD-06). */
export class GetAuditEntryUseCase {
  constructor(private readonly entries: IAuditEntryReader) {}

  async execute(input: { access: AccessContext; tenantId: string; id: string }): Promise<AuditEntryView> {
    input.access.ensure('audit.view');
    const entry = await this.entries.findById(input.tenantId, input.id);
    if (!entry) {
      throw new AuditEntryNotFoundError();
    }
    return entry;
  }
}
