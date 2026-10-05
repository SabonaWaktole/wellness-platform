import { BadgeContract } from '../validityBadge';

/** What the validity badge needs of a company's contracts, for many companies in one query (FR-CON-21). */
export interface IContractValidityReader {
  forClients(tenantId: string, clientIds: string[]): Promise<Map<string, BadgeContract[]>>;
}
