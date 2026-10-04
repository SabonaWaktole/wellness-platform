import { test, expect } from '@playwright/test';
import { provisionTenant } from './support/provision';

test.describe('Appointment Scheduling Flow', () => {
  test.setTimeout(120000);

  let tenantSlug = '';
  let userEmail = '';
  let password = '';

  test.beforeAll(async ({ request }) => {
    // Provisioned through the platform console, the only way a workspace is
    // created now that public self-signup is gone. See support/provision.ts.
    const provisioned = await provisionTenant(request, { namePrefix: 'e2e-appt' });
    tenantSlug = provisioned.tenantSlug;
    userEmail = provisioned.ownerEmail;
    password = provisioned.ownerPassword;
  });

  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto(`/${tenantSlug}/login`);
    await page.getByPlaceholder('name@company.com').fill(userEmail);
    await page.getByPlaceholder('••••••••').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(`/${tenantSlug}`);
  });

  // Use a unique client name to avoid collisions
  const uniqueId = Date.now().toString();
  const clientFirstName = `E2EApptClient${uniqueId}`;
  const clientLastName = 'Test';
  const clientFullName = `${clientFirstName} ${clientLastName}`;
  const appointmentNote = `Follow-up for ${uniqueId}`;

  test('create client -> schedule -> calendar -> confirm -> complete -> timeline', async ({ page }) => {
    // 2. Create a client
    await page.goto(`/${tenantSlug}/clients`);
    await page.click('button:has-text("Add Client")');
    await page.fill('input[placeholder="e.g. Acme Corp"]', clientFullName);
    await page.fill('input[placeholder="contact@example.com"]', `${clientFirstName.toLowerCase()}@test.com`);
    await page.click('button:has-text("Save Client")');

    // Wait to navigate to the new client's detail page
    await expect(page).toHaveURL(new RegExp(`/${tenantSlug}/clients/[0-9a-fA-F-]+$`));

    // 3. Schedule an appointment from the Client Detail page (locked-client mode)
    await page.click('button:has-text("Appointments")'); // Switch to Appointments tab
    await page.click('button:has-text("New Appointment")');
    
    // Fill out the appointment form in the slide-over
    // It should be locked to this client, so we don't need to search for the client
    page.on('response', resp => {
      if (resp.url().includes('/appointments')) {
        console.log('Appointment response:', resp.status(), resp.url());
        resp.text().then(text => console.log('Body:', text)).catch(() => {});
      }
    });

    const future = new Date();
    future.setHours(future.getHours() + 2);
    // Use local strings for the inputs to match browser timezone
    const year = future.getFullYear();
    const month = String(future.getMonth() + 1).padStart(2, '0');
    const day = String(future.getDate()).padStart(2, '0');
    const hours = String(future.getHours()).padStart(2, '0');
    const mins = String(future.getMinutes()).padStart(2, '0');

    await page.getByLabel('Date').fill(`${year}-${month}-${day}`);
    await page.getByLabel('Start').fill(`${hours}:${mins}`);
    await page.getByLabel('Note').fill(appointmentNote);
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/appointments') && (resp.status() === 201 || resp.status() >= 400)),
      page.getByRole('button', { name: 'Plan it' }).click()
    ]);

    // The planning dialog should close
    await expect(page.getByRole('heading', { name: 'Plan an activity' })).not.toBeVisible();

    // 4. Confirm it appears on the Calendar
    await page.goto(`/${tenantSlug}/appointments`);
    
    // The agenda lists it (the month shows only the company; the note is in the panel)
    await page.getByRole('button', { name: 'Agenda' }).click();
    const appointmentLocator = page.getByRole('button', { name: new RegExp(clientFullName) }).first();
    await expect(appointmentLocator).toBeVisible();

    // The status should initially be SCHEDULED (represented by the token/badge)
    // Click on the appointment to open the detail panel
    await appointmentLocator.click();

    // Detail panel should open
    const detailPanel = page.locator('text="Appointment Detail"');
    await expect(detailPanel).toBeVisible();

    // Assert initial status is SCHEDULED
    // We use getByText since Badges are spans
    const statusBadge = page.locator('span').filter({ hasText: 'Scheduled' }).first();
    await expect(statusBadge).toBeVisible();

    // 5. Confirm it
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/status') && resp.status() === 200),
      page.click('button:has-text("Mark as Confirmed")')
    ]);
    
    // Assert status changes to CONFIRMED
    const confirmedBadge = page.locator('span').filter({ hasText: 'Confirmed' }).first();
    await expect(confirmedBadge).toBeVisible({ timeout: 10000 });

    // 6. Mark it completed
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/status') && resp.status() === 200),
      page.click('button:has-text("Mark as Completed")')
    ]);

    // Assert status changes to COMPLETED
    const completedBadge = page.locator('span').filter({ hasText: 'Completed' }).first();
    await expect(completedBadge).toBeVisible({ timeout: 10000 });

    // 7. Confirm the Client Detail timeline shows the appointment with the correct final status
    await page.goto(`/${tenantSlug}/clients`);
    await page.click(`text=${clientFullName}`);
    
    // 7. Confirm the Client Detail page shows the appointment with the correct final status
    await page.goto(`/${tenantSlug}/clients`);
    await page.click(`text=${clientFullName}`);
    
    // Switch to Appointments tab
    await page.click('button:has-text("Appointments")');

    // Wait for appointments to load and assert the note text is visible
    const appointmentEntry = page.locator(`text=${appointmentNote}`).first();
    await expect(appointmentEntry).toBeVisible({ timeout: 10000 });
    
    // Assert it shows COMPLETED status on the appointments list
    const appointmentCompleted = page.locator('span').filter({ hasText: 'Completed' }).first();
    await expect(appointmentCompleted).toBeVisible({ timeout: 10000 });
  });
});
