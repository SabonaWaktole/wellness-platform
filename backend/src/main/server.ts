// Must stay first: see the module for why.
import './config/threadLimits';
import { assertRequiredEnv } from './config/env';
import { createApp } from './app';
import { createScheduler } from '../scheduler/createScheduler';

const PORT = process.env.PORT || 3000;

/**
 * Whether this process also runs the background sweeps.
 *
 * Defaults to on, so a single-process deployment — which is what §10.1
 * recommends for the MVP — gets reminders without extra configuration. It
 * exists so that when a second instance is added, every instance but one can
 * set `SCHEDULER_ENABLED=false` and avoid the double-send the Scheduler's own
 * docblock describes.
 */
const schedulerEnabled = process.env.SCHEDULER_ENABLED !== 'false';

// Validate configuration before anything else: fail loudly at boot rather than
// after the port is bound and traffic is already arriving.
try {
  assertRequiredEnv();
} catch (err) {
  console.error(`FATAL: ${(err as Error).message}`);
  process.exit(1);
}

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

if (schedulerEnabled) {
  const scheduler = createScheduler();
  scheduler.start();

  /*
   * One catch-up pass at boot, then the timers take over.
   *
   * Without it, a deploy that takes the process down for ten minutes would
   * leave every reminder in that window unsent until the next tick — and for
   * the hourly jobs, unsent for up to an hour. The sweeps are idempotent by
   * construction, so running one immediately is free.
   *
   * Not awaited: the port is already bound and readiness must not wait on a
   * database sweep.
   */
  void scheduler.runAllOnce();

  // Stop the timers before the process exits so a redeploy does not leave a
  // sweep half-run against a closing connection pool.
  const shutdown = () => {
    scheduler.stop();
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
