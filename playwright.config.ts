import { defineConfig } from '@playwright/test';

/**
 * End-to-end smoke test against a production build. It reseeds its own database (local Postgres by
 * default, never the demo database unless you point E2E_DATABASE_URL at it)
 * and runs with Gemini switched off so the result is deterministic.
 */
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgresql://kavach:kavach@localhost:5433/kavach_e2e';
const PORT = Number(process.env.E2E_PORT ?? 3200);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Uses the installed Google Chrome; set E2E_BROWSER_CHANNEL= to use Playwright's bundled Chromium.
    channel: process.env.E2E_BROWSER_CHANNEL ?? 'chrome',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx tsx scripts/e2e-prepare.ts && npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/status`,
    timeout: 400_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: E2E_DATABASE_URL, AI_DISABLED: '1', AUTH_DISABLED: '1', NEXT_DIST_DIR: '.next-e2e' },
  },
});
