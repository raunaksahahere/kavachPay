import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests against production builds, on their own local database
 * (never the demo database unless E2E_DATABASE_URL points at it), with Gemini
 * switched off so results are deterministic.
 *
 * - "open":  sign-in switched off; covers payments, the risk sheet, analyst views, APIs and the PWA.
 * - "auth":  sign-in on (needs the Clerk keys in .env.local); covers the sign-in page buttons and the
 *            two-device demo trial. Clerk's bot protection blocks automated sign-up, so a real
 *            Clerk sign-in is checked by hand.
 */
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgresql://kavach:kavach@localhost:5433/kavach_e2e';
const OPEN_PORT = Number(process.env.E2E_PORT ?? 3200);
const AUTH_PORT = OPEN_PORT + 1;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    // Uses the installed Google Chrome; set E2E_BROWSER_CHANNEL= to use Playwright's bundled Chromium.
    channel: process.env.E2E_BROWSER_CHANNEL ?? 'chrome',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'open', testIgnore: /auth-demo/, use: { baseURL: `http://localhost:${OPEN_PORT}` } },
    { name: 'auth', testMatch: /auth-demo/, use: { baseURL: `http://localhost:${AUTH_PORT}` } },
  ],
  webServer: [
    {
      command: `npx tsx scripts/e2e-prepare.ts && npx next build && npx next start -p ${OPEN_PORT}`,
      url: `http://localhost:${OPEN_PORT}/api/status`,
      timeout: 400_000,
      reuseExistingServer: false,
      env: { DATABASE_URL: E2E_DATABASE_URL, AI_DISABLED: '1', AUTH_DISABLED: '1', NEXT_DIST_DIR: '.next-e2e' },
    },
    {
      command: `npx next build && npx next start -p ${AUTH_PORT}`,
      url: `http://localhost:${AUTH_PORT}/api/status`,
      timeout: 400_000,
      reuseExistingServer: false,
      env: { DATABASE_URL: E2E_DATABASE_URL, AI_DISABLED: '1', NEXT_DIST_DIR: '.next-e2e-auth' },
    },
  ],
});
