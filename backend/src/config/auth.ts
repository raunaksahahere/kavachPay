/**
 * Sign-in is on by default: every API route needs a verified Clerk session or
 * a signed demo-trial session. AUTH_DISABLED=1 turns it off (automated tests
 * only); the client may then name the demo user it acts as.
 */
export function authEnabled(): boolean {
  return process.env.AUTH_DISABLED !== '1';
}

/** API routes that work without a session. */
export const PUBLIC_PATHS = new Set([
  '/health',
  '/openapi.json',
  '/docs',
  '/api/status',
  '/api/session',
  '/api/demo-users',
  '/api/demo-session',
]);
