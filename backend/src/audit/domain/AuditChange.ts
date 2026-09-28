/** One field's before/after, as it will sit in AuditEntry.changes. */
export interface AuditChange {
  field: string;
  old: unknown;
  new: unknown;
}
