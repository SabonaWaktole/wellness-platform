import { Interaction } from '../entities/Interaction';
import { InteractionChannel } from '../enums/InteractionChannel';
import { RecordScope } from '../../../access/domain/RecordScope';

export interface RecentInteractionsOptions {
  /** Reach over the interaction's company's assignee (FR-RBAC-11: a company's activities follow it). */
  scope?: RecordScope;
  /** Only these channels (D3: notes and activities are separate permissions). Omitted means all. */
  channels?: InteractionChannel[];
}

export interface IInteractionRepository {
  findById(id: string): Promise<Interaction | null>;
  findByClientId(tenantId: string, clientId: string): Promise<Interaction[]>;
  findRecentByTenant(tenantId: string, limit: number, options?: RecentInteractionsOptions): Promise<Interaction[]>;
  save(tenantId: string, interaction: Interaction): Promise<void>;
  /** Writes what an edit may change (FR-ACT-06); the author and creation time never change. */
  update(interaction: Interaction): Promise<void>;
}
