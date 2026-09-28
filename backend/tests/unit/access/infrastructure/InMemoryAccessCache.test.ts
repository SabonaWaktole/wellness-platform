import { InMemoryAccessCache } from '../../../../src/access/infrastructure/InMemoryAccessCache';
import { AccessContext } from '../../../../src/access/domain/AccessContext';
import { RoleKey } from '../../../../src/access/domain/RoleKey';

function contextFor(userId: string, tenantId: string): AccessContext {
  return new AccessContext({ userId, tenantId, roleKey: RoleKey.SalesUser, permissions: {}, isPlatformOperator: false });
}

describe('InMemoryAccessCache (D1: small in-process cache, cleared on any role/permission change)', () => {
  it('returns null before anything is cached', () => {
    expect(new InMemoryAccessCache().get('u1')).toBeNull();
  });

  it('returns what was set for that userId', () => {
    const cache = new InMemoryAccessCache();
    const context = contextFor('u1', 't1');
    cache.set('u1', context);

    expect(cache.get('u1')).toBe(context);
  });

  it('expires an entry after its TTL', () => {
    jest.useFakeTimers();
    const cache = new InMemoryAccessCache(1000);
    cache.set('u1', contextFor('u1', 't1'));

    jest.advanceTimersByTime(1001);

    expect(cache.get('u1')).toBeNull();
    jest.useRealTimers();
  });

  it('userChanged() drops just that user', () => {
    const cache = new InMemoryAccessCache();
    cache.set('u1', contextFor('u1', 't1'));
    cache.set('u2', contextFor('u2', 't1'));

    cache.userChanged('u1');

    expect(cache.get('u1')).toBeNull();
    expect(cache.get('u2')).not.toBeNull();
  });

  it('tenantChanged() drops every user in that tenant and no others', () => {
    const cache = new InMemoryAccessCache();
    cache.set('u1', contextFor('u1', 't1'));
    cache.set('u2', contextFor('u2', 't1'));
    cache.set('u3', contextFor('u3', 't2'));

    cache.tenantChanged('t1');

    expect(cache.get('u1')).toBeNull();
    expect(cache.get('u2')).toBeNull();
    expect(cache.get('u3')).not.toBeNull();
  });
});
