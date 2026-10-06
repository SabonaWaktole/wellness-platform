import { dayKeyInZone } from '../../shared/domain/time/tenantDay';

export interface DailyJobTenant {
  id: string;
  timeZone: string;
}

export interface DailyJobContext {
  tenant: DailyJobTenant;
  /** The workspace's calendar day, as a UTC-midnight date (M3 D4). */
  today: Date;
  /** The same day as `YYYY-MM-DD`. */
  todayKey: string;
}

/**
 * The one pattern every daily job follows (NFR-REL-01): visit each workspace,
 * work out its own "today" in its own time zone, and hand that to the job.
 *
 * A job built on it selects by state against `today` (never "yesterday"), so a
 * run after a gap finds what it missed, and records the system as the actor.
 * One workspace failing is logged and does not stop the others; the next run
 * tries it again.
 */
export async function runDailyJob(
  queries: { listTenants(): Promise<DailyJobTenant[]> },
  now: Date,
  work: (context: DailyJobContext) => Promise<number>
): Promise<{ processed: number; failedTenants: number }> {
  let processed = 0;
  let failedTenants = 0;

  for (const tenant of await queries.listTenants()) {
    try {
      const todayKey = dayKeyInZone(now, tenant.timeZone);
      processed += await work({ tenant, today: new Date(`${todayKey}T00:00:00.000Z`), todayKey });
    } catch (error) {
      failedTenants += 1;
      console.error(`Scheduler: daily job failed for tenant ${tenant.id}`, error);
    }
  }

  return { processed, failedTenants };
}
