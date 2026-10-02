import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './support/sessions';

/**
 * UAT-2 step 1 on a desktop browser (FR-DEAL-01, 07, 09, 10, 13): a second
 * deal is created for a company, dragged across the board, moved again from
 * the card menu, and the deal page's stage history shows both moves.
 *
 * Runs against a workspace seeded with `seed:wellness` and `seed:uat`, as the
 * 360 px pass does. The deal it creates is deleted at the end.
 */
const TENANT = process.env.E2E_TENANT ?? 'wellness-albania';

test.describe('UAT-2 step 1: a deal moves across the pipeline and its history shows it', () => {
  test.skip(!process.env.E2E_ADMIN_PASSWORD, 'Set E2E_ADMIN_PASSWORD to the seeded Administrator password.');
  test.use({ storageState: ADMIN_STATE });

  test('FR-DEAL-10 FR-DEAL-13 drag to Interested, menu to Negotiation, both in the stage history', async ({ page }) => {
    const search = await page.request.get(`/api/${TENANT}/clients/search?search=${encodeURIComponent('UAT Kafe Blloku')}`);
    const companyId = (await search.json()).items[0]?.id;
    expect(companyId, 'run seed:uat first — UAT Kafe Blloku is missing').toBeTruthy();

    const title = `E2E deal ${Date.now()}`;
    const created = await page.request.post(`/api/${TENANT}/deals`, { data: { clientId: companyId, type: 'EXTRA_SERVICES', title } });
    expect(created.status()).toBe(201);
    const dealId = (await created.json()).data.id;

    try {
      await page.goto(`/${TENANT}/pipeline`);
      const column = (stage: RegExp) => page.getByRole('region', { name: stage });
      const card = page.getByRole('article', { name: new RegExp(title) });
      await expect(column(/^(New lead|Kontakt i ri),/).getByRole('article', { name: new RegExp(title) })).toBeVisible();

      await card.dragTo(column(/^(Interested|I interesuar),/));
      await expect(column(/^(Interested|I interesuar),/).getByRole('article', { name: new RegExp(title) })).toBeVisible();

      await card.getByRole('button', { name: /Move to stage|Kalo në fazën/ }).click();
      await page.getByRole('menuitem', { name: /^(Negotiation|Negocim)$/ }).click();
      await expect(column(/^(Negotiation|Negocim),/).getByRole('article', { name: new RegExp(title) })).toBeVisible();

      await page.goto(`/${TENANT}/deals/${dealId}`);
      const history = page.getByRole('list', { name: /Stage history|Historiku i fazave/ });
      await expect(history).toContainText(/(New lead|Kontakt i ri) → (Interested|I interesuar)/);
      await expect(history).toContainText(/(Interested|I interesuar) → (Negotiation|Negocim)/);
    } finally {
      await page.request.delete(`/api/${TENANT}/deals/${dealId}`);
    }
  });
});
