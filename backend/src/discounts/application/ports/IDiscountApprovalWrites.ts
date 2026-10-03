import { DiscountApproval } from '../../domain/DiscountApproval';

/** One row of the approver's pending list (FR-DSC-06). Amounts are strings (NFR-ACC-02). */
export interface PendingApprovalView {
  id: string;
  offerId: string;
  dealId: string;
  companyName: string;
  dealTitle: string | null;
  reference: string;
  dealOwnerUserId: string;
  dealOwnerName: string;
  requestedByUserId: string;
  requestedByName: string;
  requestedPercent: string;
  listPriceAtRequest: string;
  reason: string;
  createdAt: string;
}

/** Writes to discount approvals, on the offer's transaction (FR-DSC-11). */
export interface IDiscountApprovalWrites {
  find(tenantId: string, id: string): Promise<DiscountApproval | null>;
  pendingForOffer(tenantId: string, quotationId: string): Promise<DiscountApproval[]>;
  /** Every request for the offer, newest first (an approval covers one version, FR-DSC-08). */
  forOffer(tenantId: string, quotationId: string): Promise<DiscountApproval[]>;
  insert(approval: DiscountApproval): Promise<void>;
  update(approval: DiscountApproval): Promise<void>;
}
