import { DiscountApproval } from '../../domain/DiscountApproval';

/**
 * Reads of discount approvals (M2 Slice 10, FR-DSC-06). Every method takes
 * `tenantId` first, so no read can cross tenants.
 */
export interface IDiscountApprovalStore {
  /** A pending, decided or withdrawn approval of the workspace, or null. */
  find(tenantId: string, id: string): Promise<DiscountApproval | null>;
  /** The offer's pending requests, oldest first (a new one supersedes them). */
  pendingForOffer(tenantId: string, quotationId: string): Promise<DiscountApproval[]>;
}
