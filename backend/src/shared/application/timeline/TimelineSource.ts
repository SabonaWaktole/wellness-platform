import { TimelineCategory, TimelineEntry } from './TimelineEntry';

/**
 * One kind of record feeding a company's timeline (FR-CMP-05). A new kind —
 * M2's deals — is one more implementation; the merger does not change.
 */
export interface TimelineSource {
  readonly category: TimelineCategory;
  /**
   * The scoped permission a viewer needs to see this source at all, checked
   * against the company's owner the way every other scoped read is.
   */
  readonly permission: string;
  load(tenantId: string, clientId: string): Promise<TimelineEntry[]>;
}
