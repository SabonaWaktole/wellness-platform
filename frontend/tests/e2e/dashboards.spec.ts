import { test, expect } from '@playwright/test';
import { provisionTenant } from './support/provision';

test.describe('Dashboard Dashboards Wiring E2E', () => {
  let slug = '';
  let email = '';
  let password = '';

  test.beforeAll(async ({ request }) => {
    // The onboarding wizard this test used to drive is gone with public
    // self-signup. Provisioning through the platform console instead keeps the
    // test about the dashboard, which is what it is named for.
    const provisioned = await provisionTenant(request, { namePrefix: 'dashcorp' });
    slug = provisioned.tenantSlug;
    email = provisioned.ownerEmail;
    password = provisioned.ownerPassword;
  });

  test('Business Owner Dashboard renders real data', async ({ page }) => {
    page.on('console', msg => console.log(`PAGE LOG: ${msg.text()}`));
    page.on('pageerror', err => console.log(`PAGE ERROR: ${err.message}`));
    page.on('response', response => console.log(`<< ${response.status()} ${response.url()}`));

    await page.goto(`/${slug}/login`);
    await page.getByPlaceholder('name@company.com').fill(email);
    await page.getByPlaceholder('••••••••').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // 4. The Business Owner is the Administrator, so signing in lands on the Administrator dashboard
    //    (M3 Slice 14, FR-DSH-01, FR-DSH-11): configuration, users and recent changes, no sales figures.
    await expect(page).toHaveURL(new RegExp(`/${slug}`));
    await expect(page.getByRole('heading', { level: 1, name: /Administrator dashboard|Paneli i administratorit/ })).toBeVisible();
    await expect(page.getByRole('region', { name: /Pricing configuration|Konfigurimi i çmimeve/ })).toBeVisible();
    await expect(page.getByRole('region', { name: /Users per role|Përdorues sipas rolit/ })).toBeVisible();

    // 5. Navigate to Clients and Create a Client to trigger data changes
    await page.getByRole('link', { name: 'Clients' }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/clients`));
    await page.getByRole('button', { name: 'Add Client' }).click();
    await page.getByLabel('Client Name').fill('John Doe');
    await page.getByLabel('Email').fill('john.doe@example.com');
    await page.getByRole('button', { name: 'Save Client' }).click();

    // 6. Go back to the dashboard: the new company is in the recent changes, read from the audit log.
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}`));
    const recent = page.getByRole('region', { name: /Recent changes|Ndryshimet e fundit/ });
    await expect(recent).toBeVisible();
    await expect(recent.getByText(/Created · Company|Krijuar · Kompani/).first()).toBeVisible();
  });
});
