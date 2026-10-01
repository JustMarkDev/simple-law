import { defineConfig, devices } from "@playwright/test";

/**
 * Config e2e: i test girano contro la build di produzione servita con
 * `bun run start` sulla porta 3200 (vedi `webServer` sotto).
 * Uso: `bun run build && bun run test:e2e`.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3200",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "bun run start -p 3200",
    url: "http://127.0.0.1:3200",
    reuseExistingServer: !process.env.CI,
    // e2e deterministici: niente chiamate AI reali (ognuna costa ~1 minuto).
    env: { SL_OPENCODE: "off" },
    timeout: 180 * 1000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
