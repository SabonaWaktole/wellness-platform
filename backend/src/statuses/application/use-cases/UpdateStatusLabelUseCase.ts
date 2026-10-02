import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { catalogueEntry, StatusDomain } from '../../domain/StatusCatalogue';
import { StatusKeyNotFoundError, StatusLabel, StatusLabelEdit, validateStatusLabelEdit } from '../../domain/StatusLabel';
import { ensureCanManage, statusLabelAuditEntry } from '../statusAdmin';
import { IStatusLabelStore } from '../ports/IStatusLabelStore';
import { IStatusLabelWriteTransaction } from '../ports/IStatusLabelWriteTransaction';

const AUDITED_FIELDS: Array<keyof StatusLabel> = ['labelSq', 'labelEn', 'colour'];

/** Renames, recolours or both, for one status key (FR-SET-07, 08). The key itself never changes. */
export class UpdateStatusLabelUseCase {
  constructor(
    private readonly store: IStatusLabelStore,
    private readonly writeTx: IStatusLabelWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; domain: StatusDomain; key: string; edit: StatusLabelEdit }): Promise<StatusLabel> {
    ensureCanManage(input.access, input.domain);
    const entry = catalogueEntry(input.domain, input.key);
    if (!entry) {
      throw new StatusKeyNotFoundError();
    }

    const before = (await this.store.find(input.tenantId, input.domain, input.key)) ?? {
      domain: input.domain,
      key: input.key,
      labelSq: entry.labelSq,
      labelEn: entry.labelEn,
      colour: entry.colour,
      order: entry.order,
    };
    const edited = validateStatusLabelEdit(input.edit);
    const after: StatusLabel = { ...before, ...edited };

    const changes = diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, AUDITED_FIELDS);
    if (changes.length === 0) {
      return after;
    }

    await this.writeTx.run(async ({ statusLabels, auditTrail }) => {
      await statusLabels.upsert(input.tenantId, input.domain, after);
      await auditTrail.record(statusLabelAuditEntry(input.access, input.tenantId, input.domain, after, AuditAction.Update, changes));
    });
    return after;
  }
}
