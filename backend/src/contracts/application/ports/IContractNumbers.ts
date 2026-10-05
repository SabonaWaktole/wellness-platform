/**
 * The next contract number of the workspace (FR-CON-05, plan D3), from the
 * shared document sequence. Called inside the create transaction, so a failed
 * create gives its number back and two creates never share one.
 */
export interface IContractNumbers {
  next(tenantId: string, now: Date): Promise<string>;
}
