import { expect, test as setup } from '@playwright/test';
import { ADMIN_STATE } from '../support/sessions';

/**
 * Signs in once as the seeded Administrator and saves the session for the
 * specs that depend on this project. Once, because the auth rate limiter
 * (NFR-SEC-02) allows only 10 sign-ins per 15 minutes from one address.
 */
setup('sign in as the Administrator', async ({ request }) => {
  const email = process.env.E2E_ADMIN_EMAIL ?? 'admin@wellness-albania.al';
  const password = process.env.E2E_ADMIN_PASSWORD;
  setup.skip(!password, 'Set E2E_ADMIN_PASSWORD to the seeded Administrator password.');

  const login = await request.post('/api/auth/login', { data: { email, password } });
  expect(login.ok(), `sign-in failed: ${login.status()}`).toBe(true);
  await request.storageState({ path: ADMIN_STATE });
});
