import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { authEnabled, PUBLIC_ROUTES } from '@/config/auth';
import { DEMO_COOKIE, verifyDemoSession } from '@/lib/auth/demo-session';

const isPublicRoute = createRouteMatcher(PUBLIC_ROUTES);

/**
 * Every page and API route needs a session, except the public routes: either a
 * signed-in Clerk user, or a signed demo-trial cookie for a shared persona.
 */
const withClerk = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  const { userId } = await auth();
  if (userId) return;
  if (await verifyDemoSession(req.cookies.get(DEMO_COOKIE)?.value)) return;
  await auth.protect();
});

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (!authEnabled()) return NextResponse.next();
  return withClerk(req, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes.
    '/(api|trpc)(.*)',
  ],
};
