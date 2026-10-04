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
  /** Whether the lost reason is an active one of the workspace (FR-DEAL-16). */
  isActiveLostReason(tenantId: string, reasonId: string): Promise<boolean>;
  /**
   * Sets the company's status to Client, in the locked STATUS field and its
   * mirror column (M1 Q9). Returns the previous status and the company's
   * name for the audit entry; null when there is no such company.
   */
  makeClient(tenantId: string, clientId: string): Promise<{ previous: string | null; companyName: string } | null>;
  /** The deal's open follow-ups, cancelled with the reason (FR-DEAL-15, 16). Returns how many. */
  cancelOpenFollowUps(tenantId: string, dealId: string, reason: string, now: Date): Promise<number>;
  /** Whether any of the deal's offers, of any version, was marked as sent (FR-DEAL-19). */
  hasSentOffer(tenantId: string, dealId: string): Promise<boolean>;
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
