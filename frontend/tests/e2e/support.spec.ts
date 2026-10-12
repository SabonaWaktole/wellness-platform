import { expect, test } from '@playwright/test';
import { expectNoMutations } from './support/noMutations';
import { ADMIN_STATE } from './support/sessions';

/**
 * Support (docs/interactive-support-tour-plan): the Help panel and the page tours, on a desktop browser with the
 * seeded Administrator session. One row per page; each page slice adds its own row when it ships its guide.
 *
 * Runs against a workspace seeded with `seed:wellness` and `seed:uat` (deploy/uat-milestone-1.md), like
 * `mobile360.spec.ts`, and is skipped without the Administrator's password.
 */
const TENANT = process.env.E2E_TENANT ?? 'wellness-albania';

/** Pages whose Help panel is checked. `tour` is false until the page's guide exists. */
const PAGES: Array<{ name: string; path: string; tour: boolean }> = [{ name: 'Administrator dashboard', path: 'dashboard', tour: false }];

test.describe('Support panel', () => {
  test.skip(!process.env.E2E_ADMIN_PASSWORD, 'Set E2E_ADMIN_PASSWORD to the seeded Administrator password.');
  test.use({ storageState: ADMIN_STATE });

  for (const { name, path, tour } of PAGES) {
    test(`${name}: Help opens the panel, which is honest about what exists`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (message) => message.type() === 'error' && consoleErrors.push(message.text()));

      await page.goto(`/${TENANT}/${path}`);
      await expect(page).not.toHaveURL(/\/login|\/unauthorized/);

      const help = page.getByRole('button', { name: /^(Help|Ndihmë)$/ });
      await expect(help).toHaveAttribute('aria-expanded', 'false');
      await help.click();
      await expect(help).toHaveAttribute('aria-expanded', 'true');

      const panel = page.getByRole('dialog');
      await expect(panel).toBeVisible();
      if (tour) await expect(panel.getByRole('button', { name: /^(Tour this page|Tour this tab|Turi i kësaj)/ })).toBeVisible();
      else await expect(panel.getByRole('heading')).toContainText(/No help|Ende nuk ka ndihmë/);

      // Escape closes it and gives focus back to the button that opened it.
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(help).toBeFocused();
      expect(consoleErrors, 'no console errors while using Support').toEqual([]);
    });
  }

  // Every page slice adds the same assertion around its own tour (start, Next to the end). Until a page has a guide
  // there is no tour to run, so this pins the weaker claim that using Support itself changes nothing.
  test('opening and closing Support changes no data', async ({ page }) => {
    await page.goto(`/${TENANT}/dashboard`);
    await expect(page).not.toHaveURL(/\/login|\/unauthorized/);
    const watch = expectNoMutations(page);
    const help = page.getByRole('button', { name: /^(Help|Ndihmë)$/ });
    await help.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    watch.assert();
  });

  // Point-and-ask works on any page, guide or not: the header and menu are explained everywhere. The click that
  // picks the control is swallowed, so it neither navigates nor changes anything.
  test('pointing at a control explains it, and changes no data', async ({ page }) => {
    await page.goto(`/${TENANT}/clients`);
    await expect(page).not.toHaveURL(/\/login|\/unauthorized/);
    const here = page.url();
    const watch = expectNoMutations(page);

    await page.getByRole('button', { name: /^(Help|Ndihmë)$/ }).click();
    await page.getByRole('button', { name: /^(Point at a control|Trego një kontroll)$/ }).click();
    await expect(page.getByText(/Pick a control|Zgjidhni një kontroll/)).toBeVisible();

    await page.locator('[data-tour="shell.nav.item"]').first().click();
    await expect(page.getByRole('heading', { level: 2, name: /A menu entry|Një zë i menusë/ })).toBeVisible();
    expect(page.url(), 'the click only explained the menu entry').toBe(here);

    await page.getByRole('button', { name: /^(Close|Mbyll)$/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: /A menu entry|Një zë i menusë/ })).toBeHidden();
    watch.assert();
  });

  test('the sidebar Support item opens the same panel', async ({ page }) => {
    await page.goto(`/${TENANT}/dashboard`);
    await page.getByRole('link', { name: /^(Support|Mbështetje)$/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
