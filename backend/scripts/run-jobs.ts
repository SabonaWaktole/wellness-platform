/**
 * Runs the daily jobs once, now or at a chosen instant, without starting the web server. For the
 * Milestone 3 UAT on staging (deploy/uat-milestone-3.md): UAT-3 step 2 runs the overdue job, UAT-7
 * step 1 the reminder job and step 3 the expiry job after moving the clock past the old end date, and
 * the job rehearsal (NFR-REL-01) runs each twice and after a gap. The jobs select by state, so the
 * instant only decides what "today" is; nothing here changes the server's clock.
 *
 * Usage:
 *   npm run jobs:run -- [--now 2026-12-01T09:00:00Z] [--only payments-overdue,contract-expiry]
 *   npm run jobs:run -- --list
 *
 * Writes (status changes, history, audit, notifications) for every workspace, so run it on staging only.
 */
import { prisma } from '../src/shared/infrastructure/prisma/client';
import { createScheduler } from '../src/scheduler/createScheduler';

const argOf = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

async function main(): Promise<void> {
  const nowArg = argOf('now');
  const now = nowArg ? new Date(nowArg) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`--now is not a date: ${nowArg}`);

  const scheduler = createScheduler({ now: () => now });
  if (process.argv.includes('--list')) {
    console.log(scheduler.jobNames().join('\n'));
    return;
  }

  console.log(`Running at ${now.toISOString()}`);
  const only = argOf('only');
  if (only) await scheduler.runNamed(only.split(',').map((name) => name.trim()).filter(Boolean));
  else await scheduler.runAllOnce();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
