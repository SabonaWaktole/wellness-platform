import { diff, actionFor } from '../../../src/audit/domain/diff';
import { AuditAction } from '../../../src/audit/domain/AuditAction';

describe('diff', () => {
  it('FR-AUD-01 returns only the fields that actually changed', () => {
    const before = { planName: 'Gold', amount: 100, notes: 'same' };
    const after = { planName: 'Platinum', amount: 100, notes: 'same' };

    const changes = diff(before, after, ['planName', 'amount', 'notes']);

    expect(changes).toEqual([{ field: 'planName', old: 'Gold', new: 'Platinum' }]);
  });

  it('FR-AUD-01 returns nothing when no listed field changed', () => {
    const before = { amount: 100 };
    const after = { amount: 100 };

    expect(diff(before, after, ['amount'])).toEqual([]);
  });

  it('FR-AUD-01 compares Date values by their instant, not by reference', () => {
    const at = new Date('2026-09-27T00:00:00.000Z');
    const before = { endsAt: new Date(at) };
    const after = { endsAt: new Date(at) };

    expect(diff(before, after, ['endsAt'])).toEqual([]);
  });

  it('FR-AUD-01 records a changed Date as ISO strings', () => {
    const before = { endsAt: new Date('2026-09-27T00:00:00.000Z') };
    const after = { endsAt: new Date('2027-09-27T00:00:00.000Z') };

    expect(diff(before, after, ['endsAt'])).toEqual([
      { field: 'endsAt', old: '2026-09-27T00:00:00.000Z', new: '2027-09-27T00:00:00.000Z' },
    ]);
  });

  it('FR-AUD-01 treats undefined and null as no value, but still reports a real change', () => {
    const changes = diff({ notes: undefined }, { notes: null }, ['notes']);
    expect(changes).toEqual([]);

    const changed = diff({ notes: null }, { notes: 'hello' }, ['notes']);
    expect(changed).toEqual([{ field: 'notes', old: null, new: 'hello' }]);
  });

  it('FR-AUD-01 compares nested objects by deep equality, not by reference', () => {
    const before = { changes: { a: 1, b: 2 } };
    const after = { changes: { a: 1, b: 2 } };

    expect(diff(before, after, ['changes'])).toEqual([]);
  });

  it('FR-AUD-01 reports a nested object that actually changed', () => {
    const before = { changes: { a: 1 } };
    const after = { changes: { a: 2 } };

    expect(diff(before, after, ['changes'])).toEqual([
      { field: 'changes', old: { a: 1 }, new: { a: 2 } },
    ]);
  });

  it('FR-AUD-07 redacts a secret field to "changed" on both sides, never the real values', () => {
    const before = { password: 'old-secret', name: 'Ada' };
    const after = { password: 'new-secret', name: 'Ada' };

    const changes = diff(before, after, ['password', 'name'], { secret: ['password'] });

    expect(changes).toEqual([{ field: 'password', old: 'changed', new: 'changed' }]);
  });

  it('FR-AUD-07 does not report an unchanged secret field at all', () => {
    const before = { token: 'same-token' };
    const after = { token: 'same-token' };

    expect(diff(before, after, ['token'], { secret: ['token'] })).toEqual([]);
  });

  it('FR-AUD-07 redacts the built-in secret field names without being told to', () => {
    const before = { hashedPassword: 'a' };
    const after = { hashedPassword: 'b' };

    expect(diff(before, after, ['hashedPassword'])).toEqual([
      { field: 'hashedPassword', old: 'changed', new: 'changed' },
    ]);
  });
});

describe('actionFor', () => {
  it('returns STATUS_CHANGE when the changed fields include "status"', () => {
    expect(actionFor([{ field: 'status', old: 'DRAFT', new: 'ACTIVE' }], AuditAction.Update)).toBe(
      AuditAction.StatusChange
    );
  });

  it('returns the given default action when no status field is present', () => {
    expect(actionFor([{ field: 'amount', old: 1, new: 2 }], AuditAction.Update)).toBe(
      AuditAction.Update
    );
  });
});
