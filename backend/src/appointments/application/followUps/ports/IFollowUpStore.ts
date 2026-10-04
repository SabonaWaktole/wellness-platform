import { RecordScope } from '../../../../access/domain/RecordScope';
import { FollowUpView } from '../followUpViews';

export interface FollowUpListFilters {
  assignedUserId?: string;
  dealId?: string;
  clientId?: string;
  /** Due before this instant (FR-FUP-08's overdue list). */
  dueBefore?: Date;
}

/** What scheduling from an activity takes from it (FR-FUP-02). */
export interface FollowUpSourceActivity {
  id: string;
  clientId: string;
  dealId: string | null;
  contactPersonId: string | null;
  nextAction: string | null;
}

/**
 * Reads of follow-ups. Every method takes `tenantId` first and, where it
 * returns follow-ups of more than one person, a `RecordScope` on the
 * salesperson, so the scope is a WHERE clause (FR-RBAC-13).
 */
export interface IFollowUpStore {
  view(tenantId: string, id: string): Promise<Omit<FollowUpView, 'isOverdue'> | null>;
  /** Open follow-ups, earliest due first. */
  listOpen(tenantId: string, scope: RecordScope, filters: FollowUpListFilters, limit: number): Promise<Omit<FollowUpView, 'isOverdue'>[]>;
  /** Open follow-ups of `assignedUserId` due before `now` (FR-FUP-07's badge). */
  countOverdue(tenantId: string, assignedUserId: string, now: Date): Promise<number>;
  activity(tenantId: string, id: string): Promise<FollowUpSourceActivity | null>;
  /** True when `contactPersonId` is a live contact of the company. */
  isContactOf(tenantId: string, clientId: string, contactPersonId: string): Promise<boolean>;
}
