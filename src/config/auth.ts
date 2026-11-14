/**
 * Clerk sign-in is on by default. Set AUTH_DISABLED=1 to turn it off (the
 * automated tests do this). Without Clerk keys in development, Clerk's own
 * keyless mode issues temporary development keys automatically; production
 * needs NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.
 */
export function authEnabled(): boolean {
  return process.env.AUTH_DISABLED !== '1';
}

/** Routes that work without a session: sign-in, the demo-trial picker, health check and PWA files. */
export const PUBLIC_ROUTES = [
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/demo(.*)',
  '/api/status',
  '/api/session',
  '/api/demo-users',
  '/api/demo-session',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline.html',
  '/icons/(.*)',
];
