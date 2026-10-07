/**
 * Told after a contract change commits that the company's validity may have
 * moved (M4 Slice 10, D8): activate, suspend, reinstate, cancel and expire.
 * Contracts must not import the membership module, so this is the whole of what
 * they know about it. An implementation never throws into the contract change:
 * a failure is logged and the daily member job repairs it.
 */
export interface IContractValidityEvents {
  contractValidityChanged(event: { tenantId: string; clientId: string; today: Date }): Promise<void>;
}
