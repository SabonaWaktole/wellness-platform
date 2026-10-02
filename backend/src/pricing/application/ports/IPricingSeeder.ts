/**
 * Gives a new workspace the default pricing configuration in `DefaultPricing`
 * (Q1, Q2, Q3, Q4, Q7). Runs after the lookup seeder, whose risk levels and
 * cities it points at.
 */
export interface IPricingSeeder {
  seed(tenantId: string): Promise<void>;
}
