import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Debounced autosave with a visible, recoverable status (spec §29).
 *
 * Two properties this has to guarantee, both learned from the shape of the
 * save endpoint rather than from taste:
 *
 *  - ONE SAVE AT A TIME. `PUT /:formId/layout` is a compare-and-set on
 *    `version`; a second write launched while the first is in flight carries
 *    the pre-bump `expectedVersion` and 409s against its own predecessor,
 *    which would surface to the owner as a spurious "changed somewhere else".
 *  - A FAILED SAVE IS NOT SILENT. §29 asks for "a clear recoverable state and
 *    retry mechanism", so a rejection parks in `error` with the edit still
 *    pending, rather than being swallowed and losing the work.
 */

/** Idle time after the last edit before a save fires. */
export const AUTOSAVE_DELAY_MS = 1500;

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutosaveOptions {
  save: () => Promise<void>;
  /** False while there is nothing to save, or saving is not appropriate
   *  (loading, a version conflict awaiting reload). */
  enabled: boolean;
}

export interface Autosave {
  status: AutosaveStatus;
  schedule: () => void;
  cancel: () => void;
  retry: () => Promise<void>;
}

export const useAutosave = ({ save, enabled }: AutosaveOptions): Autosave => {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  /** An edit arrived while a save was running; run once more when it lands. */
  const dirtyDuringSave = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const run = useCallback(async () => {
    if (inFlight.current) {
      dirtyDuringSave.current = true;
      return;
    }
    inFlight.current = true;
    setStatus('saving');
    try {
      await saveRef.current();
      setStatus('saved');
    } catch {
      // Parked, not swallowed: the edit is still unsaved and `retry` is the
      // documented way back (§29).
      setStatus('error');
    } finally {
      inFlight.current = false;
      if (dirtyDuringSave.current) {
        dirtyDuringSave.current = false;
        void run();
      }
    }
  }, []);

  const schedule = useCallback(() => {
    if (!enabled) return;
    clearTimer();
    setStatus('pending');
    timer.current = setTimeout(() => {
      timer.current = null;
      void run();
    }, AUTOSAVE_DELAY_MS);
  }, [enabled, clearTimer, run]);

  const cancel = useCallback(() => {
    clearTimer();
    setStatus('idle');
  }, [clearTimer]);

  const retry = useCallback(async () => {
    clearTimer();
    await run();
  }, [clearTimer, run]);

  // A builder unmounted mid-debounce must not fire a save into a dead tree.
  useEffect(() => clearTimer, [clearTimer]);

  return { status, schedule, cancel, retry };
};
