/** A follow-up whose due time has come and whose salesperson has not been told (FR-FUP-09). */
export interface DueFollowUp {
  id: string;
  tenantId: string;
  assignedUserId: string;
  scheduledAt: Date;
  type: string;
  clientName: string;
  notes: string | null;
}

/** One salesperson's day: follow-ups due today and those overdue from earlier days. */
export interface FollowUpDaySummary {
  assignedUserId: string;
  today: number;
  overdue: number;
}

/** What the follow-up jobs read and claim, workspace by workspace (FR-FUP-09). */
export interface IFollowUpSchedulerQueries {
  timeZone(tenantId: string): Promise<string>;
  /** Open follow-ups due in (`since`, `now`] with no due notification yet. */
  dueWithoutNotice(tenantId: string, since: Date, now: Date): Promise<DueFollowUp[]>;
  /** Marks one as notified; false when another sweep, or a reschedule, got there first. */
  claimDueNotice(tenantId: string, id: string, scheduledAt: Date, at: Date): Promise<boolean>;
  /** Moves the workspace's summary day to `dayKey`; false when that day was already claimed. */
  claimSummaryDay(tenantId: string, dayKey: string): Promise<boolean>;
  /** Per salesperson with any: open follow-ups due in [`dayStart`, `dayEnd`), and those due before `dayStart`. */
  daySummaries(tenantId: string, dayStart: Date, dayEnd: Date): Promise<FollowUpDaySummary[]>;
}
