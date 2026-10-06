/** What kind of write an AuditEntry describes. */
export enum AuditAction {
  Create = 'CREATE',
  Update = 'UPDATE',
  Delete = 'DELETE',
  StatusChange = 'STATUS_CHANGE',
  /** A CSV export of payments or performance (M3 Slice 9, FR-AUD-13): who, when and the filters used. */
  Export = 'EXPORT',
}
