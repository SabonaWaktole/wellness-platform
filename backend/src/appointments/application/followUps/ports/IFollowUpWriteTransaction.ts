import { IDealWrites } from '../../../../deals/application/ports/IDealWriteTransaction';
import { ScheduledActivity } from '../../../domain/followUps/ScheduledActivity';

/**
 * Writes to follow-ups. Every method takes `tenantId` first, so no write can
 * cross tenants; `find` reads on the same connection, so a use case decides
 * on what the transaction sees.
 */
export interface IFollowUpWrites {
  /** A follow-up of the workspace, open or closed, with its reschedule history; null for any other appointment. */
  find(tenantId: string, id: string): Promise<ScheduledActivity | null>;
  insert(followUp: ScheduledActivity): Promise<void>;
  /** Writes the follow-up and appends the reschedules it does not have stored yet (FR-FUP-06). */
  update(followUp: ScheduledActivity): Promise<void>;
}

export interface FollowUpWriteRepos {
  followUps: IFollowUpWrites;
  /** The deal is read and, from Offer Sent, moved to Follow-Up on the same connection (FR-DEAL-08). */
  deals: IDealWrites;
}

/** One transaction for a follow-up and what it does to its deal (FR-DEAL-08, 09). */
export interface IFollowUpWriteTransaction {
  run<T>(work: (repos: FollowUpWriteRepos) => Promise<T>): Promise<T>;
}
