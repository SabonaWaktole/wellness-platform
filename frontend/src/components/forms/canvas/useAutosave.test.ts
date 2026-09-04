import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutosave, AUTOSAVE_DELAY_MS } from './useAutosave';

describe('useAutosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const advance = async (ms: number) => {
    await act(async () => {
      vi.advanceTimersByTime(ms);
      await Promise.resolve();
    });
  };

  /* Flush pending microtasks. `waitFor` polls on REAL timers and simply hangs
   * under `vi.useFakeTimers`, so promise settling is driven explicitly. */
  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it('starts idle and saves nothing on its own', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useAutosave({ save, enabled: true }));

    await advance(AUTOSAVE_DELAY_MS * 3);
    expect(save).not.toHaveBeenCalled();
  });

  /* Spec §29: autosave changes, debounced. */
  it('saves once after the document settles, not once per keystroke', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave({ save, enabled: true }));

    act(() => {
      result.current.schedule();
      result.current.schedule();
      result.current.schedule();
    });

    await advance(AUTOSAVE_DELAY_MS + 10);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reports Saving then Saved', async () => {
    let resolve: () => void = () => {};
    const save = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const { result } = renderHook(() => useAutosave({ save, enabled: true }));

    act(() => result.current.schedule());
    await advance(AUTOSAVE_DELAY_MS + 10);
    expect(result.current.status).toBe('saving');

    await act(async () => { resolve(); });
    await flush();
    expect(result.current.status).toBe('saved');
  });

  /* Spec §29: "If saving fails, provide a clear recoverable state and retry." */
  it('surfaces an error state and can retry', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAutosave({ save, enabled: true }));

    act(() => result.current.schedule());
    await advance(AUTOSAVE_DELAY_MS + 10);
    await flush();
    expect(result.current.status).toBe('error');

    await act(async () => { await result.current.retry(); });
    await flush();
    expect(result.current.status).toBe('saved');
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('does not schedule while disabled', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave({ save, enabled: false }));

    act(() => result.current.schedule());
    await advance(AUTOSAVE_DELAY_MS * 3);
    expect(save).not.toHaveBeenCalled();
  });

  /*
   * A save in flight must not be raced by the timer firing again — the second
   * write would carry a stale expectedVersion and 409 against the first.
   */
  it('never runs two saves concurrently', async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    const save = vi.fn(async () => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((r) => setTimeout(r, 50));
      inFlight -= 1;
    });

    const { result } = renderHook(() => useAutosave({ save, enabled: true }));

    act(() => result.current.schedule());
    await advance(AUTOSAVE_DELAY_MS + 10);
    act(() => result.current.schedule());
    await advance(AUTOSAVE_DELAY_MS + 10);
    await advance(200);

    expect(maxConcurrent).toBe(1);
  });

  it('cancel() abandons a pending save', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave({ save, enabled: true }));

    act(() => result.current.schedule());
    act(() => result.current.cancel());
    await advance(AUTOSAVE_DELAY_MS * 2);

    expect(save).not.toHaveBeenCalled();
  });
});
