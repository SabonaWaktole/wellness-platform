import { AuditEntry } from '../../domain/AuditEntry';

/**
 * Records one compliance-trail entry, in the same connection as the write it
 * describes (FR-AUD-04). There is deliberately no `update` or `delete`
 * anywhere on this interface, its implementation, or any route: once written,
 * an entry cannot be changed (FR-AUD-05).
 *
 * **How a module gets an audit trail (FR-AUD-03):** add `auditTrail:
 * IAuditTrail` to that module's `*WriteRepos` (the shape its own
 * `I*WriteTransaction.run` hands to the use case — see
 * `ContractWriteRepos`/`PrismaContractWriteTransaction` for the pattern to
 * copy), build a `PrismaAuditTrail` on the same `tx` inside the
 * transaction's `run`, and call `repos.auditTrail.record(...)` from the use
 * case before returning. Because the call happens inside the same
 * transaction, if the audit write fails, the whole write rolls back — audit
 * is never best-effort here, unlike `IAuditLogger` for platform actions.
 */
export interface IAuditTrail {
  record(entry: AuditEntry): Promise<void>;
}
