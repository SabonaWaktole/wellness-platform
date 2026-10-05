/** The company's status as a contract moves it (FR-CON-13, FR-CON-17). */
export interface IContractCompanyStatus {
  /**
   * Sets the company to Client (the locked STATUS field, M1 Q9). Returns the
   * status it had, or null when it was already Client or the company is gone.
   */
  makeClient(tenantId: string, clientId: string): Promise<{ previous: string | null } | null>;

  /**
   * Sets a Client to Former client. Returns null, and changes nothing, for a
   * company that is not a Client: a Lead whose draft was cancelled never was one.
   */
  makeFormerClient(tenantId: string, clientId: string): Promise<{ previous: string | null } | null>;

  /** Is a renewal deal open for the company (FR-CON-17)? Not deleted, not won, not lost. */
  hasOpenRenewalDeal(tenantId: string, clientId: string): Promise<boolean>;
}
