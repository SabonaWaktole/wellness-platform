import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './support/sessions';

/**
 * FR-SCR-02 on a desktop browser (UAT-1 step 2): the sales script panel stays
 * open, at the same scroll position, while the salesperson moves from the
 * company page to another page and types in a form.
 *
 * Runs against a workspace seeded with `seed:wellness` and `seed:uat`, as the
 * 360 px pass does. The Administrator holds script.view, as salespeople do.
 */
const TENANT = process.env.E2E_TENANT ?? 'wellness-albania';
const SCRIPT = /Sales script|Skripti i shitjes/;

test.describe('FR-SCR-02 the sales script panel stays open across pages', () => {
  test.skip(!process.env.E2E_ADMIN_PASSWORD, 'Set E2E_ADMIN_PASSWORD to the seeded Administrator password.');
  test.use({ storageState: ADMIN_STATE });

  test('open on the company page, move to the edit form, type, and the panel is still there', async ({ page }) => {
    const search = await page.request.get(`/api/${TENANT}/clients/search?search=${encodeURIComponent('UAT Kafe Blloku')}`);
    const companyId = (await search.json()).items[0]?.id;
    expect(companyId, 'run seed:uat first — UAT Kafe Blloku is missing').toBeTruthy();

    await page.goto(`/${TENANT}/clients/${companyId}`);
    await page.getByRole('banner').getByRole('button', { name: SCRIPT }).click();
    const panel = page.getByRole('complementary', { name: SCRIPT });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('navigation').getByRole('button').first()).toBeVisible();

    const body = page.getByTestId('sales-script-body');
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const scrollTop = await body.evaluate((element) => element.scrollTop);

    // A client-side move, as a click in the app makes, not a reload.
    await page.getByRole('main').getByRole('button', { name: /Edit|Ndrysho/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/clients/${companyId}/edit`));
    const field = page.getByRole('main').getByRole('textbox').first();
    await field.click();
    await field.pressSequentially(' ');

    await expect(panel).toBeVisible();
    expect(await body.evaluate((element) => element.scrollTop)).toBe(scrollTop);

    await panel.getByRole('button', { name: /Close the sales script|Mbyll skriptin e shitjes/ }).click();
    await expect(panel).toBeHidden();
  });
});
