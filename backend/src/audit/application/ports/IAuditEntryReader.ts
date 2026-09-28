import { AuditEntry } from '../../domain/AuditEntry';
import { AuditFilter, AuditQuery } from '../../domain/AuditQuery';

/**
 * One row as the viewer shows it: the stored entry plus the actor's display
 * name and role names, resolved against `User`/`Role` at read time — there
 * are deliberately no foreign keys on `AuditEntry` (it must outlive the rows
 * it describes), so this join is best-effort and falls back to the id when
 * the user or role is gone.
 */
export interface AuditEntryView extends AuditEntry {
  id: string;
  at: Date;
  /** The actor's name, their email, `'System'`/`'Platform operator'` for the non-user actors, or `null` when the user no longer exists. */
  userName: string | null;
  roleNameSq: string | null;
  roleNameEn: string | null;
}

export interface AuditEntryPage {
  data: AuditEntryView[];
  total: number;
}

/**
 * The audit log viewer's read side (FR-AUD-06, 08). `IAuditTrail` stays
 * write-only (FR-AUD-05): nothing here can update or delete an entry.
 */
export interface IAuditEntryReader {
  search(tenantId: string, query: AuditQuery): Promise<AuditEntryPage>;
  findById(tenantId: string, id: string): Promise<AuditEntryView | null>;
  /** The same filter as `search`, unpaged, in `at desc` batches — for the CSV export. */
  stream(tenantId: string, filter: AuditFilter, batchSize?: number): AsyncIterable<AuditEntryView[]>;
}
