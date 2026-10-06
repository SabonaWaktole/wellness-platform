export interface ScheduledJob {
  /** Stable identifier, used in logs and in the overlap guard. */
  name: string;
  /** How often to run, in milliseconds. */
  intervalMs: number;
  /** Returns a short summary for the log; throwing is caught and logged. */
  run(now: Date): Promise<string | void>;
}

export interface SchedulerOptions {
  /**
   * Injected for tests. Real timers keep the process alive, which matters:
   * see the `unref` note in `start`.
   */
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  now?: () => Date;
}

/**
 * The one thing standing between this codebase and three unimplementable
 * requirements.
 *
 * Appointment reminders, quotation follow-ups and automatic quotation expiry
 * (§6.6, §6.5) are all "do X when enough time has passed". None of them can be
 * expressed as a reaction to a request, so all three were absent until
 * something existed to run on a clock.
 *
 * This is deliberately `setInterval` and not a queue library. A queue buys
 * durability across restarts and distribution across workers; neither is
 * useful here, because every job is a *sweep* — it asks the database what still
 * needs doing rather than consuming a list of things it was told to do. A
 * missed tick costs nothing: the next one finds the same rows. That property is
 * what makes the simple thing correct rather than merely cheap, and it is the
 * reason each job's "already done" marker is a column on the row it acts on
 * rather than state held here.
 *
 * Multi-instance deployment is the known limit. Two processes running this will
 * both sweep, and while the marker columns make double *work* harmless, they do
 * not make double *email* impossible — two instances can select the same row
 * before either writes its marker. Fixing that needs a row lock or an advisory
 * lock, which is a change to make when a second instance actually exists rather
 * than in anticipation of one.
 */
export class Scheduler {
  private handles: ReturnType<typeof setInterval>[] = [];
  /** Names of jobs currently mid-run, so a slow job cannot overlap itself. */
  private running = new Set<string>();
  private started = false;

  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private readonly now: () => Date;

  constructor(
    private readonly jobs: ScheduledJob[],
    options: SchedulerOptions = {}
  ) {
    this.setIntervalFn = options.setInterval ?? setInterval;
    this.clearIntervalFn = options.clearInterval ?? clearInterval;
    this.now = options.now ?? (() => new Date());
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    for (const job of this.jobs) {
      const handle = this.setIntervalFn(() => {
        void this.runOnce(job);
      }, job.intervalMs);

      /*
       * `unref` so the interval does not by itself keep Node alive. Without it
       * a process that has finished everything else — a test run, a one-shot
       * script that imported the app — would hang until the timer was cleared.
       * The HTTP server's own handle is what keeps a real deployment running.
       */
      if (typeof (handle as any).unref === 'function') {
        (handle as any).unref();
      }
      this.handles.push(handle);
    }

    console.log(`Scheduler started with ${this.jobs.length} job(s)`);
  }

  stop(): void {
    for (const handle of this.handles) this.clearIntervalFn(handle);
    this.handles = [];
    this.started = false;
  }

  /**
   * Runs one job now, guarding against overlap and swallowing failures.
   *
   * Public so a deployment can trigger a sweep out of band, and so tests can
   * drive a job without waiting on a timer.
   */
  async runOnce(job: ScheduledJob): Promise<void> {
    // A sweep that takes longer than its interval must not start again on top
    // of itself: the second run would select the same not-yet-marked rows and
    // send everything twice.
    if (this.running.has(job.name)) {
      console.warn(`Scheduler: skipping ${job.name}, previous run still in progress`);
      return;
    }

    this.running.add(job.name);
    try {
      const summary = await job.run(this.now());
      if (summary) console.log(`Scheduler: ${job.name} — ${summary}`);
    } catch (error) {
      // One failing job must not stop the others, and must not take the
      // process down. There is no retry: the next tick re-sweeps anyway.
      console.error(`Scheduler: ${job.name} failed`, error);
    } finally {
      this.running.delete(job.name);
    }
  }

  /** Runs every job once, in order. Used at boot so a restart catches up. */
  async runAllOnce(): Promise<void> {
    for (const job of this.jobs) await this.runOnce(job);
  }

  /** The names of the jobs, for `scripts/run-jobs.ts`. */
  jobNames(): string[] {
    return this.jobs.map((job) => job.name);
  }

  /** Runs only the named jobs once, in their usual order. An unknown name is an error, not a silent no-op. */
  async runNamed(names: string[]): Promise<void> {
    const unknown = names.filter((name) => !this.jobs.some((job) => job.name === name));
    if (unknown.length > 0) throw new Error(`No job named ${unknown.join(', ')}. Jobs: ${this.jobNames().join(', ')}`);
    for (const job of this.jobs.filter((candidate) => names.includes(candidate.name))) await this.runOnce(job);
  }
}
