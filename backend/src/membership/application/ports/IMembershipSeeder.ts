/** Gives a new workspace the tier settings, rules, relationship list and benefit table of SRS M4 (NFR-OPS-04). */
export interface IMembershipSeeder {
  seed(tenantId: string): Promise<void>;
}
