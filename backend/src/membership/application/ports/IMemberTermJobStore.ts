/** A paid term entering the expiring-soon window (FR-TIR-10, FR-TIR-11). Dates are days, YYYY-MM-DD. */
export interface ExpiringTermRow {
  termId: string;
  memberId: string;
  memberNumber: string;
  memberName: string;
  endsOn: string;
}

/** An approved VIP whose review date is inside the notice window (FR-VIP-04). */
export interface VipReviewRow {
  requestId: string;
  memberId: string;
  memberNumber: string;
  memberName: string;
  reviewDate: string;
}

/**
 * What the daily member job reads and marks outside a member's own write
 * transaction (M4 Slice 8, D9). Every method selects by state against `today`,
 * never "yesterday", so a run after a gap finds what it missed (NFR-REL-02).
 */
export interface IMemberTermJobStore {
  /**
   * Members whose stored tier may be out of date: not Bronze, with a term that
   * has an end date before `today`. Selecting on the stored tier keeps a member
   * who is already Bronze out of every later run.
   */
  membersToReview(tenantId: string, today: string): Promise<string[]>;
  /**
   * Paid terms ending from `today` to `windowEnd` that have not been announced
   * and that nothing has renewed (FR-TIR-11), for members who are not closed.
   */
  termsToAnnounce(tenantId: string, today: string, windowEnd: string): Promise<ExpiringTermRow[]>;
  /** Marks the terms announced. Called only AFTER the notification was emitted, so a failed send is retried (D9). */
  markTermsAnnounced(termIds: string[], at: Date): Promise<void>;
  /** Approved VIPs whose review date is from `today` to `windowEnd`, not extended and not yet announced (FR-VIP-04). */
  vipReviewsToAnnounce(tenantId: string, today: string, windowEnd: string): Promise<VipReviewRow[]>;
  markVipReviewAnnounced(requestId: string, at: Date): Promise<void>;
}
