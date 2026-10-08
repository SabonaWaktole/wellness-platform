import { Scheduler, ScheduledJob } from './Scheduler';
import { createScheduler } from './createScheduler';

const job = (overrides: Partial<ScheduledJob> = {}): ScheduledJob => ({
  name: 'test-job',
  intervalMs: 1000,
  run: jest.fn().mockResolvedValue('done'),
  ...overrides,
});

describe('Scheduler', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('runs a job and passes it the current time', async () => {
    const now = new Date('2026-07-28T09:00:00.000Z');
    const target = job();
    const scheduler = new Scheduler([target], { now: () => now });

    await scheduler.runOnce(target);

    expect(target.run).toHaveBeenCalledWith(now);
  });

  it('does not let a job overlap itself', async () => {
    // A sweep slower than its interval would otherwise start again on top of
    // itself and re-select the same not-yet-marked rows.
    let release: () => void = () => {};
    const slow = job({
      run: jest.fn().mockImplementation(
        () => new Promise<void>((resolve) => { release = resolve; })
      ),
    });
    const scheduler = new Scheduler([slow]);

    const first = scheduler.runOnce(slow);
    await scheduler.runOnce(slow); // returns immediately, skipped

    expect(slow.run).toHaveBeenCalledTimes(1);

    release();
    await first;
  });

  it('allows the next run once the previous one finished', async () => {
    const target = job();
    const scheduler = new Scheduler([target]);

    await scheduler.runOnce(target);
    await scheduler.runOnce(target);

    expect(target.run).toHaveBeenCalledTimes(2);
  });

  it('swallows a job failure rather than taking the process down', async () => {
    const failing = job({ run: jest.fn().mockRejectedValue(new Error('boom')) });
    const scheduler = new Scheduler([failing]);

    await expect(scheduler.runOnce(failing)).resolves.toBeUndefined();
  });

  it('clears the in-progress flag after a failure', async () => {
    // Without the `finally`, one thrown error would wedge the job forever.
    const failing = job({ run: jest.fn().mockRejectedValue(new Error('boom')) });
    const scheduler = new Scheduler([failing]);

    await scheduler.runOnce(failing);
    await scheduler.runOnce(failing);

    expect(failing.run).toHaveBeenCalledTimes(2);
  });

  it('runs every job once on demand, and one failure does not stop the rest', async () => {
    const failing = job({ name: 'a', run: jest.fn().mockRejectedValue(new Error('boom')) });
    const healthy = job({ name: 'b' });
    const scheduler = new Scheduler([failing, healthy]);

    await scheduler.runAllOnce();

    expect(healthy.run).toHaveBeenCalledTimes(1);
  });

  it('registers one timer per job and clears them on stop', () => {
    const handles = [{ unref: jest.fn() }, { unref: jest.fn() }];
    let issued = 0;
    const setIntervalFn = jest.fn(() => handles[issued++]) as unknown as typeof setInterval;
    const clearIntervalFn = jest.fn() as unknown as typeof clearInterval;

    const scheduler = new Scheduler([job({ name: 'a' }), job({ name: 'b' })], {
      setInterval: setIntervalFn,
      clearInterval: clearIntervalFn,
    });

    scheduler.start();
    expect(setIntervalFn).toHaveBeenCalledTimes(2);
    // unref'd so the timers alone never keep the process alive.
    expect(handles[0].unref).toHaveBeenCalled();

    scheduler.stop();
    expect(clearIntervalFn).toHaveBeenCalledTimes(2);
  });

  it('is idempotent on start, so a double call cannot double every timer', () => {
    const setIntervalFn = jest.fn(() => ({ unref: jest.fn() })) as unknown as typeof setInterval;
    const scheduler = new Scheduler([job()], { setInterval: setIntervalFn });

    scheduler.start();
    scheduler.start();

    expect(setIntervalFn).toHaveBeenCalledTimes(1);
  });
});

describe('Scheduler.runNamed (M3 Slice 15, scripts/run-jobs.ts)', () => {
  it('runs only the named jobs, with the injected clock, and refuses a name it does not know', async () => {
    const seen: string[] = [];
    const at = new Date('2026-12-01T09:00:00Z');
    const named = (name: string): ScheduledJob => ({ name, intervalMs: 1000, run: async (now) => { seen.push(`${name}@${now.toISOString()}`); } });
    const scheduler = new Scheduler([named('a'), named('b'), named('c')], { now: () => at });
    await scheduler.runNamed(['c', 'a']);
    expect(seen).toEqual(['a@2026-12-01T09:00:00.000Z', 'c@2026-12-01T09:00:00.000Z']);
    await expect(scheduler.runNamed(['nope'])).rejects.toThrow(/No job named nope/);
  });
});

describe('the job list (M4 Slice 8)', () => {
  it('FR-TIR-07, NFR-REL-02 the daily member job is registered with the other jobs', () => {
    const names = createScheduler().jobNames();
    expect(names).toContain('member-term');
    expect(new Set(names).size).toBe(names.length);
  });
});
