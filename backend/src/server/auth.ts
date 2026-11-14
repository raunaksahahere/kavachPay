import { createClerkClient, verifyToken } from '@clerk/backend';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { authEnabled } from '@/config/auth';
import { getDb } from '@/db/client';
import { resolveActor, type Actor } from '@/lib/auth/actor';
import { DEMO_COOKIE, verifyDemoSession } from '@/lib/auth/demo-session';

/** Header a non-browser client (curl, a mobile app) can use instead of the demo cookie. */
export const DEMO_HEADER = 'x-demo-session';

export type SessionFacts = { clerkUserId: string | null; demoUserId: string | null };

const FACTS = 'kavachSession';

function clerkToken(c: Context): string | null {
  const header = c.req.header('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim() || null;
  return getCookie(c, '__session') ?? null;
}

/**
 * The verified Clerk user and demo-trial persona for this request. Clerk is
 * only contacted when a session token is present; tokens are verified as JWTs
 * with Clerk's keys. Cached per request.
 */
export async function sessionFacts(c: Context): Promise<SessionFacts> {
  const cached = c.get(FACTS as never) as SessionFacts | undefined;
  if (cached) return cached;
  let facts: SessionFacts = { clerkUserId: null, demoUserId: null };
  if (authEnabled()) {
    let clerkUserId: string | null = null;
    const token = clerkToken(c);
    if (token && process.env.CLERK_SECRET_KEY) {
      try {
        const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
        clerkUserId = typeof payload.sub === 'string' ? payload.sub : null;
      } catch {
        clerkUserId = null;
      }
    }
    const demoValue = c.req.header(DEMO_HEADER) ?? getCookie(c, DEMO_COOKIE);
    const demo = await verifyDemoSession(demoValue);
    facts = { clerkUserId, demoUserId: demo?.userId ?? null };
  }
  c.set(FACTS as never, facts as never);
  return facts;
}

/** Whose account this request acts on; the server decides, never the client (unless sign-in is off). */
export async function currentActor(c: Context, requestedUserId?: string): Promise<Actor> {
  const s = await sessionFacts(c);
  return resolveActor(getDb(), { authEnabled: authEnabled(), ...s, requestedUserId });
}

/** Display name and e-mail for a Clerk user, to suggest a UPI ID during account setup. */
export async function clerkProfile(userId: string): Promise<{ name: string; email: string; username: string }> {
  try {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const u = await clerk.users.getUser(userId);
    return {
      name: [u.firstName, u.lastName].filter(Boolean).join(' '),
      email: u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? '',
      username: u.username ?? '',
    };
  } catch {
    return { name: '', email: '', username: '' };
  }
}
