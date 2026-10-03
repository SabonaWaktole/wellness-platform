import { DiscountApproval } from '../../domain/DiscountApproval';

export type { PendingApprovalView } from './IDiscountApprovalStore';

/** Writes to discount approvals, on the offer's transaction (FR-DSC-11). */
export interface IDiscountApprovalWrites {
  find(tenantId: string, id: string): Promise<DiscountApproval | null>;
  pendingForOffer(tenantId: string, quotationId: string): Promise<DiscountApproval[]>;
  /** Every request for the offer, newest first (an approval covers one version, FR-DSC-08). */
  forOffer(tenantId: string, quotationId: string): Promise<DiscountApproval[]>;
  insert(approval: DiscountApproval): Promise<void>;
  update(approval: DiscountApproval): Promise<void>;
}
