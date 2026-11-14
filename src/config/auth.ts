/**
 * Clerk sign-in is on by default. Set AUTH_DISABLED=1 to turn it off (the
 * automated tests do this). Without Clerk keys in development, Clerk's own
 * keyless mode issues temporary development keys automatically; production
 * needs NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.
 */
export function authEnabled(): boolean {
  return process.env.AUTH_DISABLED !== '1';
}

/** Routes that work without signing in: sign-in itself, health check and PWA files. */
export const PUBLIC_ROUTES = [
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/status',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline.html',
  '/icons/(.*)',
];
