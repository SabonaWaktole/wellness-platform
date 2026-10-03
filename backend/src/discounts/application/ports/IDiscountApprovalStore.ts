import { RecordScope } from '../../../access/domain/RecordScope';
import { DiscountApproval, DiscountApprovalKind } from '../../domain/DiscountApproval';

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
  /** A discount above the cap, or a manual price on "Price on request" (FR-PRC-09). */
  kind: DiscountApprovalKind;
  /** DISCOUNT only. */
  requestedPercent: string | null;
  /** DISCOUNT only. */
  listPriceAtRequest: string | null;
  /** MANUAL_PRICE only. */
  requestedMonthlyPrice: string | null;
  reason: string;
  createdAt: string;
}

/**
 * Discount approvals outside an offer's transaction (M2 Slice 10): the
 * approver's pending list (FR-DSC-06) and the reminder sweep (FR-DSC-12).
 * Every method takes `tenantId` first, so no read can cross tenants.
 */
export interface IDiscountApprovalStore {
  /** A pending, decided or withdrawn approval of the workspace, or null. */
  find(tenantId: string, id: string): Promise<DiscountApproval | null>;
  /** The offer's pending requests, oldest first (a new one supersedes them). */
  pendingForOffer(tenantId: string, quotationId: string): Promise<DiscountApproval[]>;
  /** Pending requests whose deal is inside `scope`, oldest first (FR-DSC-06). */
  listPending(
    tenantId: string,
    scope: RecordScope,
    page: number,
    pageSize: number
  ): Promise<{ data: PendingApprovalView[]; total: number; page: number; pageSize: number }>;
  /** Pending requests older than `hours` with no reminder sent, with what the reminder names (FR-DSC-12). */
  pendingReminderViews(tenantId: string, hours: number, now: Date): Promise<PendingApprovalView[]>;
  /** Persists a reminder or status change outside a transaction (the reminder job). */
  save(approval: DiscountApproval): Promise<void>;
}
