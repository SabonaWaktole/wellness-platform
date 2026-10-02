/**
 * Gives a new workspace the placeholder sales script in `DefaultSalesScript`,
 * published as version 1 (FR-SCR-03).
 */
export interface ISalesScriptSeeder {
  seed(tenantId: string): Promise<void>;
}
