import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { users } from '@/db/schema';
import { AppError } from '@/lib/errors';

export type ActorMode = 'open' | 'clerk' | 'demo';
export type Actor = { userId: string; mode: ActorMode };

export type SessionFacts = {
  authEnabled: boolean;
  /** Clerk user id from a verified Clerk session, if any. */
  clerkUserId: string | null;
  /** Persona id from a verified demo-trial cookie, if any. */
  demoUserId: string | null;
  /** The user id the client sent. Only trusted when sign-in is switched off (tests). */
  requestedUserId?: string;
};

/**
 * Decides whose account a request acts on. The server decides; the client
 * cannot choose an account when sign-in is on.
 *
 * - Sign-in off (automated tests): the requested demo user.
 * - Demo-trial cookie: that persona, only if it is still a demo persona.
 * - Clerk session: the one account linked to that Clerk user (409 until it is set up).
 */
export async function resolveActor(db: DbOrTx, s: SessionFacts): Promise<Actor> {
  if (!s.authEnabled) {
    if (!s.requestedUserId) throw new AppError(400, 'user_required', 'Pick a demo user.');
    return { userId: s.requestedUserId, mode: 'open' };
  }
  // An explicit demo trial wins while it lasts (it can only ever reach shared
  // synthetic personas); "Exit demo" returns a signed-in user to their own account.
  if (s.demoUserId) {
    const [persona] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, s.demoUserId), eq(users.isDemo, true)));
    if (!persona) throw new AppError(401, 'demo_expired', 'This demo account is no longer available. Pick another.');
    return { userId: persona.id, mode: 'demo' };
  }
  if (s.clerkUserId) {
    const [own] = await db.select({ id: users.id }).from(users).where(eq(users.clerkUserId, s.clerkUserId));
    if (!own) throw new AppError(409, 'onboarding_required', 'Finish setting up your account first.');
    return { userId: own.id, mode: 'clerk' };
  }
  throw new AppError(401, 'unauthenticated', 'Please sign in.');
}
