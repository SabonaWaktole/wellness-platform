import { ContractDealSource } from '../../domain/Contract';

/** A deal as a contract needs to read it (FR-CON-01, 03). */
export interface DealForContract {
  dealId: string;
  clientId: string;
  /** False when the company has been deleted: its deals are then not found. */
  clientActive: boolean;
  /** The company's responsible salesperson, which data scope reads. */
  clientAssignedUserId: string | null;
  /** The deal's salesperson, who becomes the contract's (FR-CON-03). */
  ownerUserId: string;
  /** The deal type key, for the Extra services rule (Q9). */
  type: string;
  stageKey: string;
  /** The contract a Renewal deal renews (M3 FR-REN-06); null for every other deal. */
  renewalOfContractId: string | null;
  /** The closing date, a calendar day as a UTC-midnight date. */
  closedAt: Date | null;
  /** NULL when the deal has no won offer with a price to copy. */
  source: ContractDealSource | null;
  /** The offer's contract months (M2 D2), twelve when the offer does not say. */
  contractMonths: number;
  /** The package's name for the contract's plan label. */
  packageName: string | null;
}

/** Reads a deal and the won offer a contract is filled from. Always on the write transaction's connection. */
export interface IContractDealSource {
  find(tenantId: string, dealId: string): Promise<DealForContract | null>;
}
