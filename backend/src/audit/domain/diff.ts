import { AuditChange } from './AuditChange';
import { AuditAction } from './AuditAction';

/** Field names always redacted, even when the caller does not list them. */
const ALWAYS_SECRET = ['password', 'hashedPassword', 'token'];

const REDACTED = 'changed';

/** JSON-safe form of a value for storage in AuditEntry.changes. */
function toJsonSafe(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value ?? null;
}

/** True when two values are the same for audit purposes (deep, Date-aware). */
function sameValue(a: unknown, b: unknown): boolean {
  const left = a ?? null;
  const right = b ?? null;
  if (left instanceof Date || right instanceof Date) {
    return new Date(left as Date | string).getTime() === new Date(right as Date | string).getTime();
  }
  if (left === right) {
    return true;
  }
  if (typeof left === 'object' && typeof right === 'object' && left !== null && right !== null) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return false;
}

/**
 * Compares `before` and `after` on exactly the listed fields and returns only
 * the ones that changed, JSON-safe for AuditEntry.changes.
 *
 * A field in `secret` (plus the built-in `ALWAYS_SECRET` names) is recorded as
 * the literal string "changed" on both sides when it changed, and left out
 * entirely when it did not — the trail proves a secret rotated without ever
 * holding its value (FR-AUD-07).
 */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: Array<keyof T & string>,
  options: { secret?: string[] } = {}
): AuditChange[] {
  const secretFields = new Set([...ALWAYS_SECRET, ...(options.secret ?? [])]);
  const changes: AuditChange[] = [];

  for (const field of fields) {
    const oldValue = before[field];
    const newValue = after[field];
    if (sameValue(oldValue, newValue)) {
      continue;
    }

    if (secretFields.has(field)) {
      changes.push({ field, old: REDACTED, new: REDACTED });
      continue;
    }

    changes.push({ field, old: toJsonSafe(oldValue), new: toJsonSafe(newValue) });
  }

  return changes;
}

/** STATUS_CHANGE when `status` is among the changed fields, else `fallback`. */
export function actionFor(changes: AuditChange[], fallback: AuditAction): AuditAction {
  return changes.some((change) => change.field === 'status') ? AuditAction.StatusChange : fallback;
}
