import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { catalogueKeys, StatusDomain } from '../../domain/StatusCatalogue';
import { InvalidStatusOrderError, StatusLabel } from '../../domain/StatusLabel';
import { MANAGE_STATUSES, statusLabelAuditEntry } from '../statusAdmin';
import { IStatusLabelStore } from '../ports/IStatusLabelStore';
import { IStatusLabelWriteTransaction } from '../ports/IStatusLabelWriteTransaction';
import { ListStatusLabelsUseCase } from './ListStatusLabelsUseCase';

/** Re-orders every status of one domain in one move; `keys` must list the domain's full, fixed key set exactly once. */
export class ReorderStatusLabelsUseCase {
  constructor(
    private readonly store: IStatusLabelStore,
    private readonly writeTx: IStatusLabelWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; domain: StatusDomain; keys: string[] }): Promise<StatusLabel[]> {
    input.access.ensure(MANAGE_STATUSES);
    const expected = new Set(catalogueKeys(input.domain));
    if (input.keys.length !== expected.size || new Set(input.keys).size !== expected.size || input.keys.some((key) => !expected.has(key))) {
      throw new InvalidStatusOrderError();
    }

    const current = await new ListStatusLabelsUseCase(this.store).execute({ tenantId: input.tenantId, domain: input.domain });
    const byKey = new Map(current.map((item) => [item.key, item]));

    await this.writeTx.run(async ({ statusLabels, auditTrail }) => {
      for (const [order, key] of input.keys.entries()) {
        const before = byKey.get(key)!;
        if (before.order === order) continue;
        const after = { ...before, order };
        await statusLabels.upsert(input.tenantId, input.domain, after);
        await auditTrail.record(
          statusLabelAuditEntry(input.access, input.tenantId, input.domain, after, AuditAction.Update, [{ field: 'order', old: before.order, new: order }])
        );
      }
    });

    return new ListStatusLabelsUseCase(this.store).execute({ tenantId: input.tenantId, domain: input.domain });
  }
}
