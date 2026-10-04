import { IInteractionRepository } from '../../domain/repositories/IInteractionRepository';
import { IDealWrites } from '../../../deals/application/ports/IDealWriteTransaction';
import { IFollowUpWrites } from '../../../appointments/application/followUps/ports/IFollowUpWriteTransaction';

export interface InteractionWriteRepos {
  interactions: IInteractionRepository;
  /** The linked deal is read and, on a first activity, moved on the same connection (FR-DEAL-08). */
  deals: IDealWrites;
  /** The follow-up an activity completes is closed on the same connection (M2 Slice 11, FR-FUP-06). */
  followUps: IFollowUpWrites;
}

/**
 * One transaction for an activity and what it does to its deal: logging the
 * first activity on a New Lead moves the deal to Contacted and records the
 * stage change (FR-DEAL-08, 09), or neither happens.
 */
export interface IInteractionWriteTransaction {
  run<T>(work: (repos: InteractionWriteRepos) => Promise<T>): Promise<T>;
}
