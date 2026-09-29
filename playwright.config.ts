import { defineConfig, devices } from '@playwright/test';

/**
 * Config e2e: i test girano contro la build di produzione servita con
 * `npm run start` sulla porta 3200 (vedi `webServer` sotto).
 * Uso: `npm run build && npm run test:e2e`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:3200',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run start -- -p 3200',
    url: 'http://127.0.0.1:3200',
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
