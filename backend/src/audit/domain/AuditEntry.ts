import { AuditAction } from './AuditAction';
import { AuditChange } from './AuditChange';

/** Who made a write, for AuditEntry.userId/userRole. */
export interface AuditActor {
  userId: string | null;
  userRole: string;
}

/** The scheduler is not a person; this is the actor a system-driven write records. */
export const SYSTEM_ACTOR: AuditActor = { userId: null, userRole: 'SYSTEM' };

/** One append-only row of the tenant-scoped compliance trail (FR-AUD-01). */
export interface AuditEntry {
  tenantId: string;
  userId: string | null;
  userRole: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  changes: AuditChange[];
}
