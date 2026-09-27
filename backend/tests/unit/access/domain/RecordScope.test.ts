import { admits, recordScopeFor, RecordScope } from '../../../../src/access/domain/RecordScope';
import { PermissionScope } from '../../../../src/access/domain/PermissionScope';
import { accessWith, administrator, reception, salesManager, salesUser } from '../../../support/access';

describe('RecordScope', () => {
  const team = ['sales-a', 'sales-b'];

  it('FR-RBAC-11 OWN reaches only records owned by the viewer', () => {
    const scope = recordScopeFor(salesUser({ userId: 'sales-a' }), 'companies.view', team);

    expect(scope).toEqual({ kind: 'owners', userIds: ['sales-a'], includeUnowned: false });
    expect(admits(scope, 'sales-a')).toBe(true);
    expect(admits(scope, 'sales-b')).toBe(false);
    expect(admits(scope, null)).toBe(false);
  });

  it('FR-RBAC-12 TEAM reaches the Sales Users, the viewer and unassigned records (D4)', () => {
    const scope = recordScopeFor(salesManager({ userId: 'mgr' }), 'companies.view', team);

    expect(scope.kind).toBe('owners');
    expect(admits(scope, 'sales-a')).toBe(true);
    expect(admits(scope, 'sales-b')).toBe(true);
    expect(admits(scope, 'mgr')).toBe(true);
    expect(admits(scope, null)).toBe(true);
    expect(admits(scope, 'reception-user')).toBe(false);
  });

  it('TEAM does not list the viewer twice when they are also a Sales User', () => {
    const scope = recordScopeFor(
      accessWith({ 'companies.view': 'TEAM' as any }, { userId: 'sales-a' }),
      'companies.view',
      team
    ) as Extract<RecordScope, { kind: 'owners' }>;

    expect(scope.userIds).toEqual(['sales-a', 'sales-b']);
  });

  it('ALL reaches every record', () => {
    const scope = recordScopeFor(administrator(), 'companies.view', team);

    expect(scope).toEqual({ kind: 'all' });
    expect(admits(scope, 'anyone')).toBe(true);
    expect(admits(scope, null)).toBe(true);
  });

  it('FR-RBAC-05 a key that is not held reaches nothing', () => {
    const scope = recordScopeFor(reception(), 'activities.view', team);

    expect(scope).toEqual({ kind: 'none' });
    expect(admits(scope, null)).toBe(false);
  });

  describe('narrowing (the list\'s my / team / all filter)', () => {
    it('narrows a wider grant to the requested reach', () => {
      expect(recordScopeFor(administrator({ userId: 'adm' }), 'companies.view', team, PermissionScope.Own)).toEqual({
        kind: 'owners', userIds: ['adm'], includeUnowned: false,
      });
      expect(recordScopeFor(administrator({ userId: 'adm' }), 'companies.view', team, PermissionScope.Team)).toEqual({
        kind: 'owners', userIds: ['sales-a', 'sales-b', 'adm'], includeUnowned: true,
      });
    });

    it('FR-RBAC-05 never widens past the grant', () => {
      expect(recordScopeFor(salesUser({ userId: 'sales-a' }), 'companies.view', team, PermissionScope.All)).toEqual({
        kind: 'owners', userIds: ['sales-a'], includeUnowned: false,
      });
    });
  });
});
