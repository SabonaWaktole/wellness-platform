/**
 * The admin-managed lists (Slice 8: FR-SET-01, 02). The value is the URL
 * segment: `/api/:tenantSlug/lookups/risk-levels`. Slices 9 and 10 add areas,
 * cities, follow-up intervals and lost-deal reasons here.
 */
export enum LookupList {
  RiskLevels = 'risk-levels',
  BusinessTypes = 'business-types',
}

export const LOOKUP_LISTS = Object.values(LookupList) as LookupList[];

export function isLookupList(value: string): value is LookupList {
  return (LOOKUP_LISTS as string[]).includes(value);
}

/** How each list's writes are named in the audit trail (`AuditEntry.entityType`). */
export const LOOKUP_AUDIT_ENTITY: Record<LookupList, string> = {
  [LookupList.RiskLevels]: 'RiskLevel',
  [LookupList.BusinessTypes]: 'BusinessType',
};
