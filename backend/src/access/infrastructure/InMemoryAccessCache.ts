import { AccessContext } from '../domain/AccessContext';
import { IPermissionsChanged } from '../application/ports/IPermissionsChanged';

interface CacheEntry {
  context: AccessContext;
  expiresAt: number;
}

/**
 * A per-process cache of resolved `AccessContext`s (D1: "per request, from
 * the database, small in-process cache, cleared on any role or permission
 * change"). The TTL is a safety net for a signal that never arrives — e.g. a
 * write on another process in a multi-instance deployment — not the primary
 * invalidation path; `userChanged`/`tenantChanged` are, and Slices 5 and 6
 * call them synchronously in the same request that made the change.
 */
export class InMemoryAccessCache implements IPermissionsChanged {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly ttlMs = 60_000) {}

  get(userId: string): AccessContext | null {
    const entry = this.entries.get(userId);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(userId);
      return null;
    }
    return entry.context;
  }

  set(userId: string, context: AccessContext): void {
    this.entries.set(userId, { context, expiresAt: Date.now() + this.ttlMs });
  }

  userChanged(userId: string): void {
    this.entries.delete(userId);
  }

  tenantChanged(tenantId: string): void {
    for (const [userId, entry] of this.entries) {
      if (entry.context.tenantId === tenantId) {
        this.entries.delete(userId);
      }
    }
  }
}
