/** A contract named by its number, for the "Renews CTR-…" and "Renewed by CTR-…" links (M3 FR-REN-07). */
export interface RenewalContractRef {
  id: string;
  /** The contract number, or the Legacy reference for a contract made before numbers (TD-021). */
  number: string;
}

/** How a contract is tied to the next and previous term, and to an open renewal deal (plan D9). */
export interface RenewalLinks {
  renewedFrom: RenewalContractRef | null;
  renewedInto: RenewalContractRef | null;
  /** The open Renewal deal (not deleted, Won or Lost) started from this contract, if any. */
  openDealId: string | null;
}

/** Reads and guards the renewal link between a contract and its Renewal deal (M3 Slice 10). */
export interface IContractRenewals {
  links(tenantId: string, contractId: string): Promise<RenewalLinks>;

  /**
   * Takes the contract's row lock until the transaction ends, so two parallel
   * "Start renewal" calls run one after the other and the second sees the
   * first one's deal (plan D9, the MySQL half of the one-open-deal rule). It
   * has to be the transaction's first statement. False when there is no such
   * contract.
   */
  lock(tenantId: string, contractId: string): Promise<boolean>;

  /** An active user of the workspace, who can own the deal. */
  isActiveUser(tenantId: string, userId: string): Promise<boolean>;

  /** An active lost-deal reason of the workspace (M1 FR-SET-06), the list "Not renewing" draws its reasons from (FR-REN-08). */
  activeLostReason(tenantId: string, reasonId: string): Promise<{ id: string } | null>;
}
