import { AUDITED_ENTITY_TYPES, AUDIT_ENTITY_GROUPS, typesForGroup } from '../../../../src/audit/domain/AuditQuery';

describe('audit entity groups (FR-AUD-10)', () => {
  it('FR-AUD-10 every audited entity type belongs to exactly one filter group', () => {
    const grouped = AUDIT_ENTITY_GROUPS.flatMap((group) => group.types);
    expect([...grouped].sort()).toEqual([...AUDITED_ENTITY_TYPES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('FR-AUD-10 a group expands to its entity types', () => {
    expect(typesForGroup('contracts')).toEqual(['Contract', 'ContractPayment', 'ContractSettings']);
    expect(typesForGroup('access')).toContain('Workspace');
  });
});
