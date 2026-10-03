import { AuditAction } from './AuditAction';

/**
 * Entity types an `AuditEntry` is actually written with today (Slices 2, 5,
 * 6, 8, 9, 10; M2 Slice 3). Not enforced by the domain `AuditEntry` itself — a future
 * slice can audit a new entity by writing a new string, same as any other
 * audited write (FR-AUD-03) — but the viewer's filter and the CSV export
 * validate against this list so a typo in a query string fails loudly
 * instead of silently matching nothing.
 */
export const AUDITED_ENTITY_TYPES = [
  'Contract',
  'ContractPayment',
  'User',
  'Invitation',
  'Client',
  'Role',
  'RiskLevel',
  'BusinessType',
  'Area',
  'City',
  'FollowUpInterval',
  'LostReason',
  'StatusLabel',
  'Workspace',
  // Milestone 2
  'EmployeeBand',
  'RiskSurcharge',
  'VisitFrequency',
  'PriceZone',
  'PricingSettings',
  'Service',
  'ServicePackage',
  'SalesScript',
  // Milestone 2 Slice 6: a deal's salesperson change and its deletion (FR-DEAL-05, 19).
  'Deal',
  // Milestone 2 Slice 7: the activity results list (FR-ACT-03).
  'ActivityResult',
  // Milestone 2 Slice 9: an offer's status changes and new versions (FR-OFR-15).
  'Offer',
  // Milestone 2 Slice 10: discount requests and decisions (FR-DSC-11).
  'DiscountApproval',
] as const;

export type AuditedEntityType = (typeof AUDITED_ENTITY_TYPES)[number];

/**
 * The audit log viewer's filter groups (FR-AUD-10), served to the frontend by
 * `GET /audit/entity-types`. Every audited type belongs to exactly one group,
 * so a slice that starts auditing a new entity type registers it here too.
 * Group and type labels are translations in the frontend's audit.json.
 */
export const AUDIT_ENTITY_GROUP_KEYS = ['access', 'clients', 'contracts', 'lists', 'pricing', 'salesScript', 'deals', 'offers', 'discounts'] as const;

export type AuditEntityGroup = (typeof AUDIT_ENTITY_GROUP_KEYS)[number];

export const AUDIT_ENTITY_GROUPS: ReadonlyArray<{ group: AuditEntityGroup; types: readonly AuditedEntityType[] }> = [
  { group: 'access', types: ['User', 'Invitation', 'Role', 'Workspace'] },
  { group: 'clients', types: ['Client'] },
  { group: 'contracts', types: ['Contract', 'ContractPayment'] },
  {
    group: 'lists',
    types: ['RiskLevel', 'BusinessType', 'Area', 'City', 'FollowUpInterval', 'LostReason', 'ActivityResult', 'StatusLabel'],
  },
  {
    group: 'pricing',
    types: ['EmployeeBand', 'RiskSurcharge', 'VisitFrequency', 'PriceZone', 'PricingSettings', 'Service', 'ServicePackage'],
  },
  { group: 'salesScript', types: ['SalesScript'] },
  { group: 'deals', types: ['Deal'] },
  { group: 'offers', types: ['Offer'] },
  { group: 'discounts', types: ['DiscountApproval'] },
];

export function typesForGroup(group: AuditEntityGroup): readonly AuditedEntityType[] {
  return AUDIT_ENTITY_GROUPS.find((candidate) => candidate.group === group)?.types ?? [];
}

/** The audit log viewer's search filter (FR-AUD-06), newest first. */
export interface AuditQuery {
  from?: Date;
  to?: Date;
  /** A user id, or the literal `'SYSTEM'` for scheduler-driven entries (`userId IS NULL`). */
  userId?: string;
  entityType?: AuditedEntityType;
  /** Every entity type of one filter group (FR-AUD-10). */
  entityGroup?: AuditEntityGroup;
  action?: AuditAction;
  page: number;
  limit: number;
}

/** `AuditQuery` without paging — the shared shape `search` and the CSV export filter on. */
export type AuditFilter = Omit<AuditQuery, 'page' | 'limit'>;
