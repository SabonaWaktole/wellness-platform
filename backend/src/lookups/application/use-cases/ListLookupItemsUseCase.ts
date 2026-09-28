import { AccessContext } from '../../../access/domain/AccessContext';
import { LookupList } from '../../domain/LookupList';
import { LookupRecord, sortLookupItems } from '../../domain/LookupItem';
import { allowedFilter, MANAGE_LISTS } from '../lookupAdmin';
import { LookupRulesRegistry } from '../LookupListRules';
import { ILookupStore } from '../ports/ILookupStore';

/**
 * A list's values in display order. Anyone in the workspace can read the
 * active values, since every company form needs them. Inactive values are
 * only for the people who manage the list; for anyone else
 * `includeInactive` is ignored. `filter` narrows by the list's own fields,
 * e.g. cities of one area (FR-SET-04).
 */
export class ListLookupItemsUseCase {
  constructor(
    private readonly store: ILookupStore,
    private readonly rules: LookupRulesRegistry
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    list: LookupList;
    includeInactive?: boolean;
    filter?: Record<string, unknown>;
  }): Promise<LookupRecord[]> {
    const items = await this.store.list(input.tenantId, input.list, allowedFilter(this.rules[input.list], input.filter));
    const all = input.includeInactive === true && input.access.can(MANAGE_LISTS);
    return sortLookupItems(all ? items : items.filter((item) => item.active));
  }
}
