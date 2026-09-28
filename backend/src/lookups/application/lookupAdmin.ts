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
