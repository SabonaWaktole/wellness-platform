import { Money } from '../../pricing/domain/Money';

/** The old status of an instalment that was just added, which had none. */
export const NO_PREVIOUS_STATUS = 'NONE';

/**
 * One change to an instalment (FR-PAY-08). Every receipt is one entry, so this
 * is also the receipt list (D6): a reversal is an entry with a negative amount.
 * A change that is not a status move repeats the status in both columns.
 */
export interface ContractPaymentHistoryEntry {
  id: string;
  tenantId: string;
  paymentId: string;
  fromStatus: string;
  toStatus: string;
  /** Money received in this change; negative when a receipt is reversed. */
  amountReceived: Money;
  /** The day the money arrived, on a receipt only. */
  receivedOn: Date | null;
  method: string | null;
  /** NULL when the system made the change. */
  changedByUserId: string | null;
  comment: string | null;
  changedAt: Date;
}

/** The entry as the API sends it: the amount is a two-decimal string (NFR-ACC-03). */
export const presentPaymentHistoryEntry = (entry: ContractPaymentHistoryEntry) => ({
  id: entry.id,
  paymentId: entry.paymentId,
  fromStatus: entry.fromStatus,
  toStatus: entry.toStatus,
  amountReceived: entry.amountReceived.toString(),
  receivedOn: entry.receivedOn,
  method: entry.method,
  changedByUserId: entry.changedByUserId,
  comment: entry.comment,
  changedAt: entry.changedAt,
});
