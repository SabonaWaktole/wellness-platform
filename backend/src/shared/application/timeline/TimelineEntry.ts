import { DomainError } from '../../domain/errors/DomainError';

/**
 * What the company timeline can be filtered by (FR-CMP-05). One category per
 * kind of record, not per event: a contract's creation and its status
 * changes are both CONTRACT. M2 adds DEAL.
 */
export const TIMELINE_CATEGORIES = ['CONTACT', 'NOTE', 'ACTIVITY', 'QUOTATION', 'CONTRACT', 'PAYMENT'] as const;
export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number];

export interface TimelineEntry {
  /** Unique across every source — the cursor breaks timestamp ties on it. */
  id: string;
  category: TimelineCategory;
  /** The event, e.g. CONTACT_ADDED or CONTRACT_STATUS_CHANGED. */
  type: string;
  /** ISO 8601. */
  timestamp: string;
  /** `null` when no person made the change (a scheduler) or none is recorded. */
  actorId: string | null;
  details: Record<string, unknown>;
}

export class InvalidTimelineCursorError extends DomainError {
  readonly code = 'TIMELINE_CURSOR_INVALID';

  constructor() {
    super('The timeline cursor is not valid.');
  }
}
