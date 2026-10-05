/** The company's status as a contract moves it (FR-CON-13). */
export interface IContractCompanyStatus {
  /**
   * Sets the company to Client (the locked STATUS field, M1 Q9). Returns the
   * status it had, or null when it was already Client or the company is gone.
   */
  makeClient(tenantId: string, clientId: string): Promise<{ previous: string | null } | null>;
}
