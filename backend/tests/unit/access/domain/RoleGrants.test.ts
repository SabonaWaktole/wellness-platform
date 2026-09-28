import { compareGrants, permissionSetChanges, toGrantMap } from '../../../../src/access/domain/RoleGrants';
import { InvalidPermissionGrantError } from '../../../../src/access/domain/errors';
import { PermissionScope } from '../../../../src/access/domain/PermissionScope';

const { Own, Team, All } = PermissionScope;

describe('RoleGrants', () => {
  describe('toGrantMap', () => {
    it('FR-RBAC-03 turns a list of grants into a role\'s grant map', () => {
      expect(
        toGrantMap([
          { key: 'companies.view', scope: Team },
          { key: 'users.manage', scope: null },
        ])
      ).toEqual({ 'companies.view': Team, 'users.manage': true });
    });

    it('FR-RBAC-02 refuses a key that is not in the catalogue', () => {
      expect(() => toGrantMap([{ key: 'companies.teleport', scope: All }])).toThrow(InvalidPermissionGrantError);
    });

    it('FR-RBAC-03 refuses a scoped permission without a scope', () => {
      expect(() => toGrantMap([{ key: 'companies.view', scope: null }])).toThrow(InvalidPermissionGrantError);
    });

    it('refuses a scope on a plain capability', () => {
      expect(() => toGrantMap([{ key: 'roles.manage', scope: All }])).toThrow(InvalidPermissionGrantError);
    });

    it('refuses a scope that is not Own, Team or All', () => {
      expect(() => toGrantMap([{ key: 'companies.view', scope: 'EVERYONE' as PermissionScope }])).toThrow(
        InvalidPermissionGrantError
      );
    });

    it('refuses the same key twice', () => {
      expect(() =>
        toGrantMap([
          { key: 'companies.view', scope: Own },
          { key: 'companies.view', scope: All },
        ])
      ).toThrow(InvalidPermissionGrantError);
    });

    it('stores permissions tagged for Milestone 2 and 3 now', () => {
      expect(
        toGrantMap([
          { key: 'commercial.view', scope: Own },
          { key: 'payments.update', scope: null },
        ])
      ).toEqual({ 'commercial.view': Own, 'payments.update': true });
    });

    it('names the offending key on the error', () => {
      try {
        toGrantMap([{ key: 'nope', scope: null }]);
        fail('expected a throw');
      } catch (error) {
        expect((error as InvalidPermissionGrantError).permissionKey).toBe('nope');
      }
    });
  });

  describe('compareGrants', () => {
    it('lists the keys added, removed and re-scoped, each sorted', () => {
      const before = { 'companies.view': Own, 'notes.view': All, 'users.manage': true } as const;
      const after = { 'companies.view': All, 'audit.view': true, 'activities.view': Own, 'users.manage': true } as const;

      expect(compareGrants(before, after)).toEqual({
        added: ['activities.view', 'audit.view'],
        removed: ['notes.view'],
        rescoped: ['companies.view'],
      });
    });

    it('finds nothing when the sets are the same', () => {
      expect(compareGrants({ 'companies.view': Own }, { 'companies.view': Own })).toEqual({
        added: [],
        removed: [],
        rescoped: [],
      });
    });
  });

  describe('permissionSetChanges', () => {
    it('FR-RBAC-10 records the old and new set, and the permissions added and removed', () => {
      const changes = permissionSetChanges(
        { 'contracts.validity.view': All, 'notes.view': All },
        { 'notes.view': All, 'audit.view': true }
      );

      expect(changes).toEqual([
        {
          field: 'permissions',
          old: { 'contracts.validity.view': 'ALL', 'notes.view': 'ALL' },
          new: { 'audit.view': true, 'notes.view': 'ALL' },
        },
        { field: 'permissionsAdded', old: null, new: ['audit.view'] },
        { field: 'permissionsRemoved', old: ['contracts.validity.view'], new: null },
      ]);
    });

    it('records a scope change with the scope on either side', () => {
      const changes = permissionSetChanges({ 'companies.view': Own }, { 'companies.view': Team });

      expect(changes).toContainEqual({
        field: 'scopesChanged',
        old: { 'companies.view': 'OWN' },
        new: { 'companies.view': 'TEAM' },
      });
      expect(changes.map((change) => change.field)).not.toContain('permissionsAdded');
    });

    it('records nothing when nothing changed', () => {
      expect(permissionSetChanges({ 'companies.view': Own }, { 'companies.view': Own })).toEqual([]);
    });
  });
});
