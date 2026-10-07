import { expect, test, type Page } from '@playwright/test';
import { ADMIN_STATE } from './support/sessions';

/**
 * NFR-USE-01, NFR-USE-02, NFR-USE-03: every Milestone 1, 2 and 3 screen works from 360 px wide. Opens each one
 * in a 360 px viewport (the `mobile-360` project) and asserts the page never
 * scrolls sideways — the failure that makes a phone layout unusable.
 *
 * Runs against a workspace seeded with `seed:wellness` and `seed:uat`
 * (deploy/uat-milestone-1.md). Credentials come from the environment so CI
 * and staging can use their own.
 */
const TENANT = process.env.E2E_TENANT ?? 'wellness-albania';

const LISTS = ['risk-levels', 'business-types', 'areas', 'cities', 'follow-up-intervals', 'lost-reasons', 'activity-results'];

/** Settings → Pricing's tabs (M2 Slices 3 and 4; NFR-USE-02). */
/** Settings → Wellness+'s tabs (M4 Slice 3; NFR-USE-04). */
const WELLNESS_PLUS_TABS = ['tiers', 'rules', 'relationships', 'benefits'];

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

test.describe('NFR-USE-01 NFR-USE-02 NFR-USE-03 screens have no horizontal overflow at 360px', () => {
  test.skip(!process.env.E2E_ADMIN_PASSWORD, 'Set E2E_ADMIN_PASSWORD to the seeded Administrator password.');

  test('the sign-in and password-recovery pages', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'login');

    await page.goto('/forgot-password');
    await expectNoHorizontalOverflow(page, 'forgot-password');
  });

  // M3 Slices 13 and 14: the Sales User, Sales Manager and CEO dashboards are the landing page of those roles, so
  // they are opened by signing in as them (seed:uat creates them). Set the passwords to run them. The
  // Administrator's is opened below, with the Administrator session.
  for (const [role, emailVar, passwordVar, fallbackEmail] of [
    ['Sales User', 'E2E_SALES_USER_EMAIL', 'E2E_SALES_USER_PASSWORD', 'uat.sales.a@wellness-albania.al'],
    ['Sales Manager', 'E2E_MANAGER_EMAIL', 'E2E_MANAGER_PASSWORD', 'uat.manager@wellness-albania.al'],
    ['CEO', 'E2E_CEO_EMAIL', 'E2E_CEO_PASSWORD', 'uat.ceo@wellness-albania.al'],
  ] as const) {
    test(`NFR-USE-02 FR-DSH-01 the ${role} dashboard has no horizontal overflow`, async ({ page }) => {
      const password = process.env[passwordVar];
      test.skip(!password, `Set ${passwordVar} to the seeded ${role} password.`);
      const login = await page.request.post('/api/auth/login', { data: { email: process.env[emailVar] ?? fallbackEmail, password } });
      expect(login.ok(), `sign-in failed: ${login.status()}`).toBe(true);
      await page.goto(`/${TENANT}/dashboard`);
      await expect(page.getByRole('heading', { level: 1, name: /My dashboard|Paneli im|Sales team dashboard|Paneli i ekipit|CEO dashboard|Paneli i drejtorit/ })).toBeVisible();
      await expectNoHorizontalOverflow(page, `${role} dashboard`);
    });
  }

  test.describe('signed in as the Administrator', () => {
    test.use({ storageState: ADMIN_STATE });
    let companyId: string;
    let dealId: string;
    let contractId: string;
    let memberId: string;

    test.beforeEach(async ({ page }) => {
      if (!companyId) {
        const search = await page.request.get(`/api/${TENANT}/clients/search?search=${encodeURIComponent('UAT Kafe Blloku')}`);
        companyId = (await search.json()).items[0]?.id;
        expect(companyId, 'run seed:uat first — UAT Kafe Blloku is missing').toBeTruthy();
      }
      if (!dealId) {
        // seed:uat gives UAT Kafe Blloku a New contract deal (M2 Slice 6).
        const deals = await page.request.get(`/api/${TENANT}/deals?clientId=${companyId}`);
        dealId = (await deals.json()).data?.items[0]?.id;
        expect(dealId, 'run seed:uat first — UAT Kafe Blloku has no deal').toBeTruthy();
      }
    });

    // M3 Slices 4 to 6 (NFR-USE-03): the contract screens open on a seeded contract (seed:uat gives UAT Kafe Blloku one).
    test.beforeEach(async ({ page }) => {
      if (!contractId) {
        const contracts = await page.request.get(`/api/${TENANT}/contracts?search=${encodeURIComponent('UAT Kafe Blloku')}`);
        contractId = (await contracts.json()).data?.[0]?.id;
        expect(contractId, 'run seed:uat first — UAT Kafe Blloku has no contract').toBeTruthy();
      }
    });

    // M4 Slice 4 (NFR-USE-04): the member screens open on a member of their own, registered once and found again by name.
    test.beforeEach(async ({ page }) => {
      if (!memberId) {
        const found = await page.request.get(`/api/${TENANT}/membership/members?query=${encodeURIComponent('E2E Mobile')}`);
        memberId = (await found.json()).data?.[0]?.id;
        if (!memberId) {
          const created = await page.request.post(`/api/${TENANT}/membership/members`, {
            data: { firstName: 'E2E', lastName: 'Mobile', email: 'e2e.mobile@example.com', confirmDifferentPerson: true },
          });
          memberId = (await created.json()).data?.id;
        }
        expect(memberId, 'the Administrator could not register an E2E member').toBeTruthy();
      }
    });

    const screens: Array<[string, (id: string) => string]> = [
      // M3 Slice 14: this is the Administrator dashboard, the Administrator's landing page (FR-DSH-11)
      ['dashboard', () => 'dashboard'],
      ['company list', () => 'clients'],
      ['new company form', () => 'clients/new'],
      ['company detail (contacts, timeline)', (id) => `clients/${id}`],
      ['company edit form', (id) => `clients/${id}/edit`],
      ['contracts', () => 'contracts'],
      // M3 Slices 4 to 6: the contract's own screens
      ['contract detail (instalments, history, document)', () => `contracts/${contractId}`],
      ['contract edit form', () => `contracts/${contractId}/edit`],
      ['new contract form', () => 'contracts/new'],
      // M3 Slice 9
      ['payments overview', () => 'payments'],
      // M3 Slice 11
      ['renewals', () => 'renewals'],
      // M3 Slice 12
      ['performance', () => 'performance'],
      ['settings → workspace', () => 'settings'],
      ['settings → team', () => 'settings/team'],
      ['settings → roles & permissions', () => 'settings/roles'],
      ['settings → audit log', () => 'settings/audit'],
      ['settings → statuses', () => 'settings/statuses'],
      // M3 Slice 3
      ['settings → contracts and payments', () => 'settings/contracts'],
      // M4 Slice 3
      ...WELLNESS_PLUS_TABS.map((tab): [string, () => string] => [`settings → wellness+ → ${tab}`, () => `settings/wellness-plus/${tab}`]),
      ...LISTS.map((list): [string, () => string] => [`settings → lists → ${list}`, () => `settings/lists/${list}`]),
      ...PRICING_TABS.map((tab): [string, () => string] => [`settings → pricing → ${tab}`, () => `settings/pricing/${tab}`]),
      // M2 Slice 5
      ['settings → sales script', () => 'settings/sales-script'],
      // M2 Slice 6 (FR-DEAL-13: the board scrolls inside its own area, never the page)
      ['pipeline board', () => 'pipeline'],
      ['pipeline list', () => 'pipeline/list'],
      ['deal page', () => `deals/${dealId}`],
      ['new deal form', () => 'deals/new'],
      // M2 Slice 8: the pricing screen, from a deal and from a company
      ['pricing screen (deal)', () => `deals/${dealId}/pricing`],
      ['pricing screen (company)', (id) => `clients/${id}/pricing`],
      // M2 Slice 9: the offers list (the deal page above carries the offer panel)
      ['offers list', () => 'offers'],
      // M2 Slice 10: the pending discount approvals (FR-DSC-06)
      ['discount approvals', () => 'approvals'],
      // M2 Slice 11: My follow-ups (FR-FUP-07)
      ['my follow-ups', () => 'follow-ups'],
      // M2 Slice 12: the sales calendar's day and agenda views (FR-CAL-01)
      ['calendar (day)', () => 'appointments?view=day'],
      ['calendar (agenda)', () => 'appointments?view=agenda'],
      ['calendar (week)', () => 'appointments?view=week'],
      ['calendar (month)', () => 'appointments?view=month'],
      // M4 Slice 4: the member list, the new-member form, a member page and its edit form
      ['members', () => 'members'],
      ['new member form', () => 'members/new'],
      ['member detail (terms, family, history, note)', () => `members/${memberId}`],
      ['member edit form', () => `members/${memberId}/edit`],
      // M4 Slice 5: the Membership payments list (the Payments tab and the record-payment dialog are on the member page)
      ['membership payments', () => 'members/payments'],
      // M4 Slice 7: the VIP requests list (the VIP tab and its dialogs are on the member page)
      ['VIP requests', () => 'members/vip-requests'],
      // M4 Slice 9: the corporate employee upload
      ['Employee upload', () => 'members/employee-upload'],
      // M2 Slice 6: the deal edit form
      ['deal edit form', () => `deals/${dealId}/edit`],
    ];

    test('NFR-USE-02 FR-SCR-02 the sales script panel covers the phone screen and closes', async ({ page }) => {
      await page.goto(`/${TENANT}/clients/${companyId}`);
      await page.getByRole('banner').getByRole('button', { name: /Sales script|Skripti i shitjes/ }).click();
      const panel = page.getByRole('complementary', { name: /Sales script|Skripti i shitjes/ });
      await expect(panel).toBeVisible();
      const box = await panel.boundingBox();
      // The browser measures in fractions of a pixel (359.99998 on CI), so
      // "covers the screen" is within a pixel of the viewport, not exactly 360.
      expect(box?.width).toBeCloseTo(360, 0);
      await expectNoHorizontalOverflow(page, 'sales script panel');

      await panel.getByRole('button', { name: /Close the sales script|Mbyll skriptin e shitjes/ }).click();
      await expect(panel).toBeHidden();
    });

    test('NFR-USE-02 FR-DEAL-13 the board scrolls inside its own area and a card offers "Move to stage"', async ({ page }) => {
      await page.goto(`/${TENANT}/pipeline`);
      const column = page.getByRole('region', { name: /^(New lead|Kontakt i ri),/ });
      await expect(column).toBeVisible();
      await expectNoHorizontalOverflow(page, 'pipeline board');

      await column.getByRole('button', { name: /Move to stage|Kalo në fazën/ }).first().click();
      await expect(page.getByRole('menu')).toBeVisible();
      await expect(page.getByRole('menuitem', { name: /Negotiation|Negocim/ })).toBeVisible();
      await page.keyboard.press('Escape');
    });

    test('NFR-USE-02 FR-ACT-01 the activity dialog fits the phone screen, all six types included', async ({ page }) => {
      await page.goto(`/${TENANT}/clients/${companyId}?logInteraction=VISIT`);
      const dialog = page.getByRole('dialog', { name: /Record activity|Regjistro aktivitet/ });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('radio')).toHaveCount(6);
      await expect(dialog.getByRole('radio', { name: /Visit|Vizitë/ })).toHaveAttribute('aria-checked', 'true');
      await expectNoHorizontalOverflow(page, 'activity dialog');
      await page.keyboard.press('Escape');
    });

    for (const [screen, path] of screens) {
      test(screen, async ({ page }) => {
        await page.goto(`/${TENANT}/${path(companyId)}`);
        await expect(page).not.toHaveURL(/\/login|\/unauthorized/);
        await expectNoHorizontalOverflow(page, screen);
      });
    }
  });
});
