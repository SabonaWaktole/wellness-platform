import { IInteractionRepository } from '../../domain/repositories/IInteractionRepository';
import { IDealWrites } from '../../../deals/application/ports/IDealWriteTransaction';

export interface InteractionWriteRepos {
  interactions: IInteractionRepository;
  /** The linked deal is read and, on a first activity, moved on the same connection (FR-DEAL-08). */
  deals: IDealWrites;
}

/**
 * One transaction for an activity and what it does to its deal: logging the
 * first activity on a New Lead moves the deal to Contacted and records the
 * stage change (FR-DEAL-08, 09), or neither happens.
 */
export interface IInteractionWriteTransaction {
  run<T>(work: (repos: InteractionWriteRepos) => Promise<T>): Promise<T>;
}
