/**
 * Sign-in is on by default. AUTH_DISABLED=1 turns it off (automated tests);
 * the backend must then also run with AUTH_DISABLED=1.
 */
export function authEnabled(): boolean {
  return process.env.AUTH_DISABLED !== '1';
}

/** Pages that work without a session: the homepage, sign-in, sign-up, the demo-trial picker and PWA files. */
export const PUBLIC_ROUTES = [
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/demo(.*)',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline.html',
  '/icons/(.*)',
];

/** Name of the backend's demo-trial cookie (the backend verifies it; the frontend only checks it exists). */
export const DEMO_COOKIE = 'kavach_demo';
