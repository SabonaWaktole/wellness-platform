import { AuditAction } from './AuditAction';

/**
 * Entity types an `AuditEntry` is actually written with today (Slices 2, 5,
 * 6, 8). Not enforced by the domain `AuditEntry` itself — a future slice can
 * audit a new entity by writing a new string, same as any other audited
 * write (FR-AUD-03) — but the viewer's filter and the CSV export validate
 * against this list so a typo in a query string fails loudly instead of
 * silently matching nothing.
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
] as const;

export type AuditedEntityType = (typeof AUDITED_ENTITY_TYPES)[number];

/** The audit log viewer's search filter (FR-AUD-06), newest first. */
export interface AuditQuery {
  from?: Date;
  to?: Date;
  /** A user id, or the literal `'SYSTEM'` for scheduler-driven entries (`userId IS NULL`). */
  userId?: string;
  entityType?: AuditedEntityType;
  action?: AuditAction;
  page: number;
  limit: number;
}

/** `AuditQuery` without paging — the shared shape `search` and the CSV export filter on. */
export type AuditFilter = Omit<AuditQuery, 'page' | 'limit'>;
