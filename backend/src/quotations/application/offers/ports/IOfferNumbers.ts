/**
 * The next offer number (FR-OFR-08, D5): the workspace's prefix, the year in
 * the workspace's time zone and the year's next sequence, e.g. OF-2026-0001.
 * Taken on the caller's transaction, under the counter's row lock, so a
 * failed create gives the number back and two creates never share one. A
 * number handed out is never reused, even if its draft is deleted later.
 */
export interface IOfferNumbers {
  next(tenantId: string, now: Date): Promise<string>;
}
