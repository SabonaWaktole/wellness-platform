import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]) => readFileSync(resolve(__dirname, '..', '..', ...parts), 'utf8');

/**
 * NFR-USE-03: every Milestone 3 screen is in the 360 px end-to-end suite (`mobile360.spec.ts`),
 * which is what asserts it never scrolls sideways. A new route cannot be added without this list
 * (and so the suite) being extended, because the first test reads the router.
 *
 * `route` is the path in `routes/index.tsx`; `opened` is how the suite spells it.
 */
const M3_SCREENS: Array<{ screen: string; route: string; opened: string }> = [
  { screen: 'dashboard (Administrator, in the suite; the other three roles by sign-in)', route: 'dashboard', opened: "() => 'dashboard'" },
  { screen: 'contracts', route: 'contracts', opened: "() => 'contracts'" },
  { screen: 'contract detail', route: 'contracts/:contractId', opened: 'contracts/${contractId}`' },
  { screen: 'contract edit form', route: 'contracts/:contractId/edit', opened: 'contracts/${contractId}/edit' },
  { screen: 'new contract form', route: 'contracts/new', opened: "() => 'contracts/new'" },
  { screen: 'payments overview', route: 'payments', opened: "() => 'payments'" },
  { screen: 'renewals', route: 'renewals', opened: "() => 'renewals'" },
  { screen: 'performance', route: 'performance', opened: "() => 'performance'" },
  { screen: 'settings → contracts and payments', route: 'settings/contracts', opened: "() => 'settings/contracts'" },
];

describe('NFR-USE-03 the 360 px suite covers every Milestone 3 screen', () => {
  const routes = read('src', 'routes', 'index.tsx');
  const suite = read('tests', 'e2e', 'mobile360.spec.ts');

  it.each(M3_SCREENS)('NFR-USE-03 $screen is a route and is opened by the 360 px suite', ({ route, opened }) => {
    expect(routes).toContain(`path: '${route}'`);
    expect(suite).toContain(opened);
  });

  it('NFR-USE-03 the three dashboards that are a role\'s landing page are opened by signing in as that role', () => {
    for (const role of ['Sales User', 'Sales Manager', 'CEO']) expect(suite).toContain(`['${role}', 'E2E_`);
    expect(suite).toContain('has no horizontal overflow');
  });

  it('NFR-USE-03 the suite asserts "no sideways scroll" for every screen it opens', () => {
    expect(suite).toContain('expectNoHorizontalOverflow(page, screen)');
    expect(suite).toContain('NFR-USE-03');
  });
});

describe('NFR-USE-04 the 360 px suite covers every Milestone 4 screen built so far', () => {
  const routes = read('src', 'routes', 'index.tsx');
  const suite = read('tests', 'e2e', 'mobile360.spec.ts');

  it('NFR-USE-04 settings → Wellness+ is a route, and each of its four tabs is opened by the suite', () => {
    expect(routes).toContain("path: 'settings/wellness-plus/:tab?'");
    expect(suite).toContain('WELLNESS_PLUS_TABS');
    for (const tab of ['tiers', 'rules', 'relationships', 'benefits']) expect(suite).toContain(`'${tab}'`);
    expect(suite).toContain('settings/wellness-plus/${tab}');
  });

  it.each([
    ['members', "() => 'members'"],
    ['members/new', "() => 'members/new'"],
    ['members/payments', "() => 'members/payments'"],
    ['members/vip-requests', "() => 'members/vip-requests'"],
    ['members/employee-upload', "() => 'members/employee-upload'"],
    ['members/:memberId', 'members/${memberId}`'],
    ['members/:memberId/edit', 'members/${memberId}/edit'],
  ])('NFR-USE-04 the %s screen is a route and is opened by the suite', (route, opened) => {
    expect(routes).toContain(`path: '${route}'`);
    expect(suite).toContain(opened);
  });
});
