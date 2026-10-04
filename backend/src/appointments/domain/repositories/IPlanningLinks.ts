/**
 * What a planned item may point at (FR-CAL-02): a deal and a contact that
 * belong to the item's company, live and in the same workspace.
 */
export interface IPlanningLinks {
  dealBelongsToCompany(tenantId: string, clientId: string, dealId: string): Promise<boolean>;
  contactBelongsToCompany(tenantId: string, clientId: string, contactPersonId: string): Promise<boolean>;
}
