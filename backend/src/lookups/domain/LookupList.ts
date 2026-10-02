/**
 * The admin-managed lists (Slice 8: FR-SET-01, 02; Slice 9: FR-SET-03, 04;
 * Slice 10: FR-SET-05, 06; M2 Slice 7: FR-ACT-03). The value is the URL segment:
 * `/api/:tenantSlug/lookups/risk-levels`.
 */
export enum LookupList {
  RiskLevels = 'risk-levels',
  BusinessTypes = 'business-types',
  Areas = 'areas',
  Cities = 'cities',
  FollowUpIntervals = 'follow-up-intervals',
  LostReasons = 'lost-reasons',
  ActivityResults = 'activity-results',
}

export const LOOKUP_LISTS = Object.values(LookupList) as LookupList[];

export function isLookupList(value: string): value is LookupList {
  return (LOOKUP_LISTS as string[]).includes(value);
}

/** How each list's writes are named in the audit trail (`AuditEntry.entityType`). */
export const LOOKUP_AUDIT_ENTITY: Record<LookupList, string> = {
  [LookupList.RiskLevels]: 'RiskLevel',
  [LookupList.BusinessTypes]: 'BusinessType',
  [LookupList.Areas]: 'Area',
  [LookupList.Cities]: 'City',
  [LookupList.FollowUpIntervals]: 'FollowUpInterval',
  [LookupList.LostReasons]: 'LostReason',
  [LookupList.ActivityResults]: 'ActivityResult',
};
