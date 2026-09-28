import { AccessContext } from '../../../access/domain/AccessContext';
import { LookupList } from '../../domain/LookupList';
import { LookupRecord, sortLookupItems } from '../../domain/LookupItem';
import { MANAGE_LISTS } from '../lookupAdmin';
import { ILookupStore } from '../ports/ILookupStore';

/**
 * A list's values in display order. Anyone in the workspace can read the
 * active values, since every company form needs them. Inactive values are
 * only for the people who manage the list; for anyone else
 * `includeInactive` is ignored.
 */
export class ListLookupItemsUseCase {
  constructor(private readonly store: ILookupStore) {}

  async execute(input: { access: AccessContext; tenantId: string; list: LookupList; includeInactive?: boolean }): Promise<LookupRecord[]> {
    const items = await this.store.list(input.tenantId, input.list);
    const all = input.includeInactive === true && input.access.can(MANAGE_LISTS);
    return sortLookupItems(all ? items : items.filter((item) => item.active));
  }
}
