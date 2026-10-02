import { defineConfig, devices } from '@playwright/test';

/**
 * `mobile-360` is the NFR-USE-01 device pass (tests/e2e/mobile360.spec.ts):
 * every Milestone 1 screen at 360 px. `desktop` holds the Wellness Albania
 * specs that need a desktop browser and the seeded Administrator session
 * (the sales script panel, M2 Slice 5). The older `chromium` specs predate the
 * Wellness Albania edition and are not part of CI.
 *
 * Both dev servers start from here; `cwd` is relative to this file.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: [/mobile360\.spec\.ts/, /salesScript\.spec\.ts/, /\.setup\.ts/],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'setup',
      testMatch: /setup\/.*\.setup\.ts/,
    },
    {
      name: 'desktop',
      testMatch: /salesScript\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-360',
      testMatch: /mobile360\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 360, height: 780 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      cwd: '.',
      timeout: 120000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:3000/api/auth/me',
      reuseExistingServer: !process.env.CI,
      cwd: '../backend',
      timeout: 120000,
    },
  ],
});
