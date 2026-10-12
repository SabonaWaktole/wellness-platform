import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANNOUNCEMENT_LIFETIME_MS, announce, useAnnouncerStore } from './announcer';

describe('SUP-14 announcer store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAnnouncerStore.getState().clear();
  });
  afterEach(() => vi.useRealTimers());

  it('SUP-14 holds the latest message', () => {
    announce('Step 1 of 3: Add');
    announce('Step 2 of 3: Filter');
    expect(useAnnouncerStore.getState().message).toBe('Step 2 of 3: Filter');
  });

  it('SUP-14 suppresses an identical consecutive message', () => {
    announce('Tour closed');
    const first = useAnnouncerStore.getState().sequence;
    announce('Tour closed');
    expect(useAnnouncerStore.getState().sequence).toBe(first);
  });

  it('SUP-14 announces the same text again after a different one', () => {
    announce('A');
    announce('B');
    const before = useAnnouncerStore.getState().sequence;
    announce('A');
    expect(useAnnouncerStore.getState().sequence).toBe(before + 1);
  });

  it('SUP-14 clears itself after a while so the region can unmount, and the same text can be announced next session', () => {
    announce('Tour closed');
    vi.advanceTimersByTime(ANNOUNCEMENT_LIFETIME_MS - 1);
    expect(useAnnouncerStore.getState().message).toBe('Tour closed');
    vi.advanceTimersByTime(2);
    expect(useAnnouncerStore.getState().message).toBe('');
    announce('Tour closed');
    expect(useAnnouncerStore.getState().message).toBe('Tour closed');
  });

  it('SUP-14 a newer message restarts the lifetime', () => {
    announce('A');
    vi.advanceTimersByTime(ANNOUNCEMENT_LIFETIME_MS - 100);
    announce('B');
    vi.advanceTimersByTime(ANNOUNCEMENT_LIFETIME_MS - 100);
    expect(useAnnouncerStore.getState().message).toBe('B');
  });

  it('SUP-14 ignores an empty message', () => {
    announce('');
    expect(useAnnouncerStore.getState().message).toBe('');
  });
});
