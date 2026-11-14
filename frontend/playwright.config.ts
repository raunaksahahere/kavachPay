import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests of the whole system: the backend API (../backend) and a
 * production build of this frontend, on their own local database (never the
 * demo database unless E2E_DATABASE_URL points at it), with Gemini off.
 *
 * - "open": sign-in switched off on both services; payments, risk sheet, analyst views, APIs, PWA.
 * - "auth": sign-in on (Clerk keys from the .env.local files); sign-in page buttons and the
 *           two-device demo trial. Clerk's bot protection blocks automated sign-up, so a real
 *           Clerk sign-in is checked by hand.
 */
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgresql://kavach:kavach@localhost:5433/kavach_e2e';
const ports = { openWeb: 3200, authWeb: 3201, openApi: 4200, authApi: 4201 };

const backend = (port: number, extra: Record<string, string>, prepare = false) => ({
  command: `cd ../backend && ${prepare ? 'npx tsx scripts/e2e-prepare.ts && ' : ''}npx tsx src/server/index.ts`,
  url: `http://localhost:${port}/health`,
  timeout: 300_000,
  reuseExistingServer: false,
  env: {
    PORT: String(port),
    DATABASE_URL: E2E_DATABASE_URL,
    AI_DISABLED: '1',
    MIGRATE_ON_START: '0',
    FRONTEND_ORIGINS: `http://localhost:${ports.openWeb},http://localhost:${ports.authWeb}`,
    ...extra,
  },
});

const frontend = (port: number, apiPort: number, distDir: string, extra: Record<string, string>) => ({
  command: `npx next build && npx next start -p ${port}`,
  url: `http://localhost:${port}/sign-in`,
  timeout: 400_000,
  reuseExistingServer: false,
  env: { BACKEND_URL: `http://localhost:${apiPort}`, NEXT_DIST_DIR: distDir, ...extra },
});

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
    { name: 'open', testIgnore: /auth-demo/, use: { baseURL: `http://localhost:${ports.openWeb}` } },
    { name: 'auth', testMatch: /auth-demo/, use: { baseURL: `http://localhost:${ports.authWeb}` } },
  ],
  webServer: [
    backend(ports.openApi, { AUTH_DISABLED: '1' }, true),
    backend(ports.authApi, { DEMO_SESSION_SECRET: 'e2e-demo-secret' }),
    frontend(ports.openWeb, ports.openApi, '.next-e2e', { AUTH_DISABLED: '1' }),
    frontend(ports.authWeb, ports.authApi, '.next-e2e-auth', {}),
  ],
});
