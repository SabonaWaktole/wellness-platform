/**
 * An activity as the company timeline and the deal page show it (FR-ACT-05):
 * its type, when it happened, who recorded it, the contact, the result and
 * the next action. `recordedAt` is when it was saved, which the 24-hour edit
 * window counts from (FR-ACT-06).
 */
export interface ActivityView {
  id: string;
  clientId: string;
  dealId: string | null;
  channel: string;
  content: string;
  occurredAt: string;
  recordedAt: string;
  updatedAt: string | null;
  author: { id: string; name: string };
  contact: { id: string; name: string } | null;
  /** Both labels, so each reader sees the result in their own language. */
  result: { id: string; nameSq: string; nameEn: string | null } | null;
  clientFeedback: string | null;
  nextAction: string | null;
}
