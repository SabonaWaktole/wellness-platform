/**
 * Tags a CustomFieldDefinition as the tenant's designated field for a system
 * concern (search, PDFs, transactional email, reports, dashboard scoping).
 * Fields can be freely renamed/retyped/deleted by the tenant, so code that
 * needs "the client's email" etc. resolves it via role rather than a fixed
 * column/key name. At most one field per (tenantId, role) — see
 * CustomFieldDefinition.create.
 */
export enum FieldRole {
  PRIMARY_NAME = 'PRIMARY_NAME',
  PRIMARY_EMAIL = 'PRIMARY_EMAIL',
  PRIMARY_PHONE = 'PRIMARY_PHONE',
  STATUS = 'STATUS',
  ASSIGNEE = 'ASSIGNEE',
}
