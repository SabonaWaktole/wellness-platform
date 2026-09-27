/** What kind of write an AuditEntry describes. */
export enum AuditAction {
  Create = 'CREATE',
  Update = 'UPDATE',
  Delete = 'DELETE',
  StatusChange = 'STATUS_CHANGE',
}
