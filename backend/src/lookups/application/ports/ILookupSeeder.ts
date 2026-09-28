/** Gives a new workspace the placeholder lists in `DefaultLookups` (FR-SET-10). */
export interface ILookupSeeder {
  seed(tenantId: string): Promise<void>;
}
