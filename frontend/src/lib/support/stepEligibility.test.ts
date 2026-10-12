import { describe, expect, it } from 'vitest';
import { isStepEligible, type EligibilityUser } from './stepEligibility';
import type { Requirement } from './types';

const user = (over: Partial<EligibilityUser> = {}): EligibilityUser => ({
  permissions: {},
  tenantSalesWorkflow: 'SALES_PROCESS',
  ...over,
});

const ok = (requires: Requirement | undefined, who: EligibilityUser | null, viewport: 'desktop' | 'mobile' = 'desktop') =>
  isStepEligible({ requires }, who, viewport);

describe('SUP-09 step eligibility', () => {
  it('SUP-09 a step with no requirement applies to everyone, even with no user', () => {
    expect(ok(undefined, user())).toBe(true);
    expect(ok({}, null)).toBe(true);
  });

  describe('permission', () => {
    it('SUP-09 a held key passes, an absent key fails', () => {
      expect(ok({ permission: 'deals.edit' }, user({ permissions: { 'deals.edit': 'OWN' } }))).toBe(true);
      expect(ok({ permission: 'deals.edit' }, user({ permissions: { 'deals.view': 'ALL' } }))).toBe(false);
    });

    it('SUP-09 an unscoped capability (true) counts as held', () => {
      expect(ok({ permission: 'settings.manage' }, user({ permissions: { 'settings.manage': true } }))).toBe(true);
    });

    it('SUP-09 a list needs every key', () => {
      const requires = { permission: ['deals.edit', 'deals.view'] };
      expect(ok(requires, user({ permissions: { 'deals.edit': 'ALL', 'deals.view': 'ALL' } }))).toBe(true);
      expect(ok(requires, user({ permissions: { 'deals.edit': 'ALL' } }))).toBe(false);
    });

    it('SUP-09 a missing permissions map holds nothing', () => {
      expect(ok({ permission: 'deals.edit' }, { tenantSalesWorkflow: 'SALES_PROCESS' })).toBe(false);
      expect(ok({ permission: 'deals.edit' }, null)).toBe(false);
    });
  });

  describe('anyPermission', () => {
    it('SUP-09 one held key is enough', () => {
      const requires = { anyPermission: ['a.view', 'b.view'] };
      expect(ok(requires, user({ permissions: { 'b.view': 'OWN' } }))).toBe(true);
      expect(ok(requires, user({ permissions: { 'c.view': 'OWN' } }))).toBe(false);
    });

    it('SUP-09 an empty list requires nothing', () => {
      expect(ok({ anyPermission: [] }, user())).toBe(true);
    });
  });

  describe('minScope', () => {
    const requires: Requirement = { permission: 'deals.view', minScope: 'ALL' };

    it.each([
      ['OWN', false],
      ['TEAM', false],
      ['ALL', true],
      [true, true],
    ] as const)('SUP-09 deals.view held at %s against minScope ALL is %s', (scope, expected) => {
      expect(ok(requires, user({ permissions: { 'deals.view': scope } }))).toBe(expected);
    });

    it('SUP-09 TEAM satisfies minScope TEAM and OWN does not', () => {
      expect(ok({ permission: 'x', minScope: 'TEAM' }, user({ permissions: { x: 'TEAM' } }))).toBe(true);
      expect(ok({ permission: 'x', minScope: 'TEAM' }, user({ permissions: { x: 'OWN' } }))).toBe(false);
    });

    it('SUP-09 with anyPermission, one key at the scope is enough', () => {
      const any: Requirement = { anyPermission: ['a', 'b'], minScope: 'ALL' };
      expect(ok(any, user({ permissions: { a: 'OWN', b: 'ALL' } }))).toBe(true);
      expect(ok(any, user({ permissions: { a: 'OWN', b: 'TEAM' } }))).toBe(false);
    });
  });

  describe('workflow', () => {
    it('SUP-09 compares with the tenant workflow', () => {
      expect(ok({ workflow: 'SALES_PROCESS' }, user({ tenantSalesWorkflow: 'SALES_PROCESS' }))).toBe(true);
      expect(ok({ workflow: 'SALES_PROCESS' }, user({ tenantSalesWorkflow: 'LEGACY_QUOTATIONS' }))).toBe(false);
    });

    it('SUP-09 an unset workflow is the legacy one, as the menu treats it', () => {
      expect(ok({ workflow: 'LEGACY_QUOTATIONS' }, user({ tenantSalesWorkflow: null }))).toBe(true);
      expect(ok({ workflow: 'SALES_PROCESS' }, user({ tenantSalesWorkflow: undefined }))).toBe(false);
    });
  });

  describe('viewport', () => {
    it('SUP-09 matches the current viewport', () => {
      expect(ok({ viewport: 'desktop' }, user(), 'desktop')).toBe(true);
      expect(ok({ viewport: 'desktop' }, user(), 'mobile')).toBe(false);
      expect(ok({ viewport: 'mobile' }, user(), 'mobile')).toBe(true);
    });
  });

  it('SUP-09 every field must pass together', () => {
    const requires: Requirement = { permission: 'deals.edit', workflow: 'SALES_PROCESS', viewport: 'desktop' };
    const who = user({ permissions: { 'deals.edit': 'ALL' } });
    expect(ok(requires, who, 'desktop')).toBe(true);
    expect(ok(requires, who, 'mobile')).toBe(false);
    expect(ok(requires, { ...who, tenantSalesWorkflow: 'LEGACY_QUOTATIONS' }, 'desktop')).toBe(false);
  });

  it('SUP-09 never reads role', () => {
    const asOwner = { ...user({ permissions: {} }), role: 'BUSINESS_OWNER' } as EligibilityUser;
    expect(ok({ permission: 'deals.edit' }, asOwner)).toBe(false);
  });
});
