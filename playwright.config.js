// ─── playwright.config.js ─────────────────────────────────────────────────────
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:   './tests/e2e',
  timeout:   30_000,
  retries:   process.env.CI ? 2 : 0,
  workers:   process.env.CI ? 1 : undefined,
  reporter:  [['html', { outputFolder: 'playwright-report' }], ['list']],

  use: {
    baseURL:            'http://localhost:5000',
    trace:              'on-first-retry',
    screenshot:         'only-on-failure',
    video:              'retain-on-failure',
    // Permissions needed for PWA / notifications
    permissions:        ['notifications'],
    serviceWorkers:     'allow',
  },

  // Spin up a static file server for the repo root
  webServer: {
    command:   'npx serve . -p 5000 --no-clipboard',
    url:       'http://localhost:5000',
    reuseExistingServer: !process.env.CI,
    timeout:   15_000,
  },

  projects: [
    {
      name:  'chromium',
      use:   { ...devices['Desktop Chrome'] },
    },
    {
      name:  'firefox',
      use:   { ...devices['Desktop Firefox'] },
    },
    {
      name:  'mobile-chrome',
      use:   { ...devices['Pixel 5'] },
    },
    {
      name:  'mobile-safari',
      use:   { ...devices['iPhone 13'] },
    },
  ],
});
