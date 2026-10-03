import { IAuditTrail } from '../../../../audit/application/ports/IAuditTrail';
import { IDealWrites } from '../../../../deals/application/ports/IDealWriteTransaction';
import { Offer, OfferLanguage } from '../../../domain/Offer';

/**
 * Writes to offers. Every method takes `tenantId` first, or an offer that
 * carries it, so no write can cross tenants. Reads run on the same
 * connection, so a use case decides on what the transaction sees.
 */
export interface IOfferWrites {
  /** The deal's draft offer, or null. */
  currentDraft(tenantId: string, dealId: string): Promise<Offer | null>;
  /** How many offers the deal has had, drafts included. */
  countForDeal(tenantId: string, dealId: string): Promise<number>;
  /** A new offer with its services and its first status-history row. */
  insert(offer: Offer): Promise<void>;
  /** The draft's content and services, replaced. */
  update(offer: Offer): Promise<void>;
  /** The language a new offer is written in: the workspace's, if it is one an offer can be in. */
  workspaceLanguage(tenantId: string): Promise<OfferLanguage>;
  /**
   * Sets the company's employee count (FR-PRC-04) and returns what it was,
   * with the company's name for the audit label; null if there is no such
   * company.
   */
  setCompanyEmployees(
    tenantId: string,
    clientId: string,
    employees: number,
    userId: string
  ): Promise<{ previous: number | null; companyName: string } | null>;
}

export interface OfferWriteRepos {
  offers: IOfferWrites;
  /** The offer's deal is read, valued and, on its first offer, moved on the same connection (FR-DEAL-08). */
  deals: IDealWrites;
  auditTrail: IAuditTrail;
}

/**
 * One transaction for a draft offer and what it changes: its deal's value
 * and stage (FR-DEAL-08, 09) and, when asked, the company's employee count
 * with its audit entry (FR-PRC-04). All of it, or none.
 */
export interface IOfferWriteTransaction {
  run<T>(work: (repos: OfferWriteRepos) => Promise<T>): Promise<T>;
}
