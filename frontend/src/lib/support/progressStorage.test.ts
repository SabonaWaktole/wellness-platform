import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROGRESS_STORAGE_KEY, progressUserKey, readPageProgress, readProgress, writeProgress } from './progressStorage';

const alice = 'u1:acme';
const bob = 'u2:acme';

/** An in-memory Storage: under Node 26, Node's own `localStorage` global shadows jsdom's and is unusable without a file. */
const memoryStorage = (): Storage => {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
};

let storage: Storage;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SUP-17 progress storage', () => {
  it('SUP-17 keys progress by user and workspace', () => {
    expect(progressUserKey({ userId: 'u1', tenantSlug: 'acme' })).toBe('u1:acme');
    expect(progressUserKey({ userId: 'u1' })).toBe('u1:');
  });

  it('SUP-17 reads nothing before anything is written', () => {
    expect(readProgress(alice)).toEqual({});
    expect(readPageProgress(alice, 'clients.list', 1)).toBeNull();
  });

  it('SUP-17 round-trips a page record', () => {
    writeProgress(alice, 'clients.list', { v: 1, lastStepId: 'filters' });
    expect(readPageProgress(alice, 'clients.list', 1)).toEqual({ v: 1, lastStepId: 'filters' });
    writeProgress(alice, 'clients.list', { v: 1, completedAt: '2026-10-12T10:00:00.000Z' });
    expect(readPageProgress(alice, 'clients.list', 1)).toEqual({ v: 1, completedAt: '2026-10-12T10:00:00.000Z' });
  });

  it('SUP-17 keeps other pages and other users when one record is written', () => {
    writeProgress(alice, 'clients.list', { v: 1, dismissedAt: 'x' });
    writeProgress(alice, 'followUps', { v: 2, lastStepId: 'a' });
    writeProgress(bob, 'clients.list', { v: 1, lastStepId: 'b' });
    expect(readProgress(alice)).toEqual({ 'clients.list': { v: 1, dismissedAt: 'x' }, followUps: { v: 2, lastStepId: 'a' } });
    expect(readPageProgress(bob, 'clients.list', 1)).toEqual({ v: 1, lastStepId: 'b' });
  });

  it('SUP-17 a record from an older guide version is treated as absent, so a changed guide is offered again', () => {
    writeProgress(alice, 'clients.list', { v: 1, completedAt: 'x' });
    expect(readPageProgress(alice, 'clients.list', 2)).toBeNull();
  });

  it('SUP-17 a record from a newer guide version is also absent (a rolled back guide)', () => {
    writeProgress(alice, 'clients.list', { v: 3, completedAt: 'x' });
    expect(readPageProgress(alice, 'clients.list', 2)).toBeNull();
  });

  it.each(['{not json', 'null', '[]', '"text"', '42', '{"u1:acme":"nope"}', '{"u1:acme":{"clients.list":{"v":"1"}}}'])(
    'SUP-17 ignores stored value %s and recovers on the next write',
    (stored) => {
      localStorage.setItem(PROGRESS_STORAGE_KEY, stored);
      expect(readProgress(alice)).toEqual({});
      expect(readPageProgress(alice, 'clients.list', 1)).toBeNull();
      writeProgress(alice, 'clients.list', { v: 1, lastStepId: 'a' });
      expect(readPageProgress(alice, 'clients.list', 1)).toEqual({ v: 1, lastStepId: 'a' });
    },
  );

  it('SUP-17 storage that throws on read does not crash', () => {
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readProgress(alice)).toEqual({});
    expect(readPageProgress(alice, 'clients.list', 1)).toBeNull();
  });

  it('SUP-17 storage that throws on write does not crash and reports failure', () => {
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(writeProgress(alice, 'clients.list', { v: 1 })).toBe(false);
  });

  it('SUP-17 a successful write reports success', () => {
    expect(writeProgress(alice, 'clients.list', { v: 1 })).toBe(true);
  });
});
