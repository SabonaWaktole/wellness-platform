/**
 * Which renewal reminder a contract is due, and which lead times it has
 * passed without one (M3 D8, FR-REN-01, FR-REN-03).
 *
 * `leadDays` are the workspace's lead times, `daysLeft` the whole days from the
 * workspace's today to the end date, and `recorded` the lead times that already
 * have a row, SENT or SKIPPED. Of the lead times reached and not yet recorded,
 * the smallest is sent and every larger one is skipped: a contract first seen
 * with 25 days left gets the 30-day reminder, and the 60-day one is recorded as
 * skipped rather than sent late. Pure, so the rule is tested by table.
 */
export interface ReminderPlan {
  /** The lead time to send now, or null when nothing is due. */
  send: number | null;
  /** Lead times reached and passed over, to be recorded as SKIPPED. */
  skip: number[];
}

export function planRenewalReminder(input: { leadDays: readonly number[]; daysLeft: number; recorded: readonly number[] }): ReminderPlan {
  const reached = [...new Set(input.leadDays)]
    .filter((lead) => input.daysLeft <= lead && !input.recorded.includes(lead))
    .sort((a, b) => a - b);
  if (reached.length === 0) return { send: null, skip: [] };
  const [send, ...skip] = reached;
  return { send, skip: skip.sort((a, b) => b - a) };
}
