import { AccessContext } from '../../access/domain/AccessContext';
import { AuditAction } from '../../audit/domain/AuditAction';
import { AuditChange } from '../../audit/domain/AuditChange';
import { AuditEntry } from '../../audit/domain/AuditEntry';
import { LookupItemNotFoundError } from '../domain/errors';
import { LOOKUP_AUDIT_ENTITY, LookupList } from '../domain/LookupList';
import { LookupRecord } from '../domain/LookupItem';
import { LookupListRules } from './LookupListRules';
import { ILookupStore } from './ports/ILookupStore';

/** Every write to a list needs this (FR-SET-01, 02). */
export const MANAGE_LISTS = 'settings.manage';

/**
 * The activity results are also managed under the "Activity results, stage
 * labels" row of the role matrix (SRS §9.2, M2 Slice 7, FR-ACT-03), so either
 * key edits that list. Every other list stays `settings.manage` only.
 */
export const MANAGE_ACTIVITY_RESULTS = 'activityResults.manage';

/** Every key that can edit some list: what the write routes let through. */
export const LIST_EDIT_KEYS = [MANAGE_LISTS, MANAGE_ACTIVITY_RESULTS];

export function canManageList(access: AccessContext, list: LookupList): boolean {
  return access.can(MANAGE_LISTS) || (list === LookupList.ActivityResults && access.can(MANAGE_ACTIVITY_RESULTS));
}

/** Throws `PermissionDeniedError` unless `access` may edit `list`. */
export function ensureCanManageList(access: AccessContext, list: LookupList): void {
  if (list === LookupList.ActivityResults && access.can(MANAGE_ACTIVITY_RESULTS)) return;
  access.ensure(MANAGE_LISTS);
}

export async function findItem(store: ILookupStore, tenantId: string, list: LookupList, id: string): Promise<LookupRecord> {
  const item = await store.findById(tenantId, list, id);
  if (!item) {
    throw new LookupItemNotFoundError();
  }
  return item;
}

/** The audited fields of a value: its labels, then the list's own fields as the log should show them. */
export async function auditFieldsOf(rules: LookupListRules, tenantId: string, item: LookupRecord): Promise<Record<string, unknown>> {
  return { nameSq: item.nameSq, nameEn: item.nameEn, ...(await rules.describe(tenantId, item)) };
}

export const auditedFields = (rules: LookupListRules) => ['nameSq', 'nameEn', ...rules.auditFields];

/** One audit entry for a write to `item` (FR-AUD-02, settings). Named by its Albanian label. */
export function lookupAuditEntry(
  access: AccessContext,
  tenantId: string,
  list: LookupList,
  item: LookupRecord,
  action: AuditAction,
  changes: AuditChange[]
): AuditEntry {
  return {
    tenantId,
    userId: access.userId,
    userRole: access.auditRole,
    action,
    entityType: LOOKUP_AUDIT_ENTITY[list],
    entityId: item.id,
    entityLabel: item.nameSq,
    changes,
  };
}

/** Only the list's own fields out of a request body, so a body cannot set `id`, `order` or `active`. */
export function pickFields(values: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter((field) => field in values).map((field) => [field, values[field]]));
}

/**
 * Only the keys `rules` allows filtering by (City's `areaId`, FR-SET-04), and
 * only when their value is a plain string — a query param an unfiltered list
 * doesn't recognise, or an array from a repeated param, is dropped rather
 * than reaching the store.
 */
export function allowedFilter(rules: LookupListRules, filter: Record<string, unknown> | undefined): Record<string, string> {
  const fields = rules.filterFields ?? [];
  return Object.fromEntries(
    Object.entries(filter ?? {}).filter((entry): entry is [string, string] => fields.includes(entry[0]) && typeof entry[1] === 'string')
  );
}
