import { expect, test, type Page } from '@playwright/test';
import { ADMIN_STATE } from './support/sessions';

/**
 * NFR-USE-01: every Milestone 1 screen works from 360 px wide. Opens each one
 * in a 360 px viewport (the `mobile-360` project) and asserts the page never
 * scrolls sideways — the failure that makes a phone layout unusable.
 *
 * Runs against a workspace seeded with `seed:wellness` and `seed:uat`
 * (deploy/uat-milestone-1.md). Credentials come from the environment so CI
 * and staging can use their own.
 */
const TENANT = process.env.E2E_TENANT ?? 'wellness-albania';

const LISTS = ['risk-levels', 'business-types', 'areas', 'cities', 'follow-up-intervals', 'lost-reasons'];

/** Settings → Pricing's tabs (M2 Slices 3 and 4; NFR-USE-02). */
const PRICING_TABS = ['bands', 'risk', 'frequencies', 'zones', 'cap', 'services', 'packages', 'offer', 'calculator'];

async function expectNoHorizontalOverflow(page: Page, screen: string) {
  // Let late-loading data (tables, timelines) lay out before measuring.
  await page.waitForLoadState('networkidle');
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${screen} scrolls sideways at ${clientWidth}px`).toBeLessThanOrEqual(clientWidth);
}

test.describe('NFR-USE-01 M1 screens have no horizontal overflow at 360px', () => {
  test.skip(!process.env.E2E_ADMIN_PASSWORD, 'Set E2E_ADMIN_PASSWORD to the seeded Administrator password.');

  test('the sign-in and password-recovery pages', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'login');

    await page.goto('/forgot-password');
    await expectNoHorizontalOverflow(page, 'forgot-password');
  });

  test.describe('signed in as the Administrator', () => {
    test.use({ storageState: ADMIN_STATE });
    let companyId: string;

    test.beforeEach(async ({ page }) => {
      if (!companyId) {
        const search = await page.request.get(`/api/${TENANT}/clients/search?search=${encodeURIComponent('UAT Kafe Blloku')}`);
        companyId = (await search.json()).items[0]?.id;
        expect(companyId, 'run seed:uat first — UAT Kafe Blloku is missing').toBeTruthy();
      }
    });

    const screens: Array<[string, (id: string) => string]> = [
      ['dashboard', () => 'dashboard'],
      ['company list', () => 'clients'],
      ['new company form', () => 'clients/new'],
      ['company detail (contacts, timeline)', (id) => `clients/${id}`],
      ['company edit form', (id) => `clients/${id}/edit`],
      ['contracts', () => 'contracts'],
      ['settings → workspace', () => 'settings'],
      ['settings → team', () => 'settings/team'],
      ['settings → roles & permissions', () => 'settings/roles'],
      ['settings → audit log', () => 'settings/audit'],
      ['settings → statuses', () => 'settings/statuses'],
      ...LISTS.map((list): [string, () => string] => [`settings → lists → ${list}`, () => `settings/lists/${list}`]),
      ...PRICING_TABS.map((tab): [string, () => string] => [`settings → pricing → ${tab}`, () => `settings/pricing/${tab}`]),
    ];

    for (const [screen, path] of screens) {
      test(screen, async ({ page }) => {
        await page.goto(`/${TENANT}/${path(companyId)}`);
        await expect(page).not.toHaveURL(/\/login|\/unauthorized/);
        await expectNoHorizontalOverflow(page, screen);
      });
    }
  });
});
