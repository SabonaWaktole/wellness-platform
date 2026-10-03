import { IAuditTrail } from '../../../../audit/application/ports/IAuditTrail';
import { IDealWrites } from '../../../../deals/application/ports/IDealWriteTransaction';
import { Offer, OfferLanguage } from '../../../domain/Offer';
import { IOfferNumbers } from './IOfferNumbers';

/**
 * Writes to offers. Every method takes `tenantId` first, or an offer that
 * carries it, so no write can cross tenants. Reads run on the same
 * connection, so a use case decides on what the transaction sees.
 */
export interface IOfferWrites {
  /** An offer (a quotation with a deal) of the workspace, or null. */
  find(tenantId: string, id: string): Promise<Offer | null>;
  /** The deal's latest offer that no later version replaces, whatever its status, or null. */
  latest(tenantId: string, dealId: string): Promise<Offer | null>;
  /** How many offers the deal has had, drafts included. */
  countForDeal(tenantId: string, dealId: string): Promise<number>;
  /** A new offer or version with its services and its first status-history row (NONE → DRAFT). */
  insert(offer: Offer): Promise<void>;
  /** The draft's content, services and status, replaced (the pricing screen). */
  update(offer: Offer): Promise<void>;
  /** The status columns only: status, the dates, the render snapshot, superseded (FR-OFR-09). */
  saveStatus(offer: Offer): Promise<void>;
  /** One status-history row (FR-OFR-15). A NULL user is the scheduler. */
  recordStatusChange(change: OfferStatusChange): Promise<void>;
  /** The workspace's time zone, for "today" and the number's year (FR-OFR-08, 10). */
  timeZone(tenantId: string): Promise<string>;
  /** Whether the contact is a live contact person of the company (FR-OFR-02). */
  isContactOf(tenantId: string, clientId: string, contactPersonId: string): Promise<boolean>;
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

/** One row of an offer's status history (FR-OFR-15). */
export interface OfferStatusChange {
  tenantId: string;
  offerId: string;
  fromStatus: string;
  toStatus: string;
  userId: string | null;
  note: string | null;
}

export interface OfferWriteRepos {
  offers: IOfferWrites;
  /** Numbers new offers on the same transaction (FR-OFR-08). */
  numbers: IOfferNumbers;
  /** The offer's deal is read, valued and, on its first offer, moved on the same connection (FR-DEAL-08). */
  deals: IDealWrites;
  auditTrail: IAuditTrail;
}

/**
 * One transaction for an offer write and what it changes: its number
 * (FR-OFR-08), its status history and audit entry (FR-OFR-15, FR-AUD-09),
 * its deal's value and stage (FR-DEAL-08, 09) and, when asked, the company's
 * employee count with its audit entry (FR-PRC-04). All of it, or none.
 */
export interface IOfferWriteTransaction {
  run<T>(work: (repos: OfferWriteRepos) => Promise<T>): Promise<T>;
}
