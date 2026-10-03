import { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';
import { Deal, DealStageChange } from '../../domain/Deal';

/**
 * Writes to deals. Every method takes `tenantId` first, so no write can cross
 * tenants. `find` reads on the same connection, so a use case decides on what
 * the transaction sees.
 */
export interface IDealWrites {
  /** A live (not deleted) deal of the workspace, or null. Its scope is checked by the caller. */
  find(tenantId: string, id: string): Promise<Deal | null>;
  /** The deal's company name, for its audit label. */
  companyName(tenantId: string, clientId: string): Promise<string>;
  insert(deal: Deal): Promise<void>;
  update(deal: Deal): Promise<void>;
  /** One stage-history row (FR-DEAL-09). */
  recordChange(tenantId: string, change: DealStageChange): Promise<void>;
  /**
   * The deal's value: its current offer's net monthly price and annual value,
   * two-decimal strings or null (Slice 8). The board and the list read it
   * from the deal (FR-DEAL-10, 11).
   */
  setOfferValue(tenantId: string, dealId: string, value: { netMonthlyPrice: string | null; annualValue: string | null }): Promise<void>;
}

export interface DealWriteRepos {
  deals: IDealWrites;
  auditTrail: IAuditTrail;
}

/**
 * One transaction for a deal write, its stage history and, for a
 * reassignment or a delete, its audit entry (FR-DEAL-05, FR-AUD-09): if the
 * audit write fails, the change rolls back.
 */
export interface IDealWriteTransaction {
  run<T>(work: (repos: DealWriteRepos) => Promise<T>): Promise<T>;
}
