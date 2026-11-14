import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { authEnabled, DEMO_COOKIE, PUBLIC_ROUTES } from '@/config/auth';

const isPublicRoute = createRouteMatcher(PUBLIC_ROUTES);

/**
 * Page routing only. Pages need a Clerk sign-in or a demo-trial cookie, else
 * they send the visitor to sign-in. This is a convenience check: the backend
 * verifies every API request itself, so nothing here is a security boundary.
 * API calls (/api/*) skip this proxy and are forwarded to the backend.
 */
const withClerk = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  const { userId } = await auth();
  if (userId || req.cookies.has(DEMO_COOKIE)) return;
  await auth.protect();
});

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (!authEnabled()) return NextResponse.next();
  return withClerk(req, event);
}

export const config = {
  // Pages only: skip Next.js internals, static files and the API (proxied to the backend).
  matcher: ['/((?!api/|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)'],
};
