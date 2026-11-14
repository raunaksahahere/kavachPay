import { currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { authEnabled } from '@/config/auth';
import { getDb } from '@/db/client';
import { accounts, users } from '@/db/schema';
import { findOwnAccount, suggestHandle } from '@/lib/accounts/onboard';
import { handle, sessionFacts } from '@/lib/api/http';
import { accountForUser } from '@/lib/api/users';

/**
 * Who is using the app right now:
 * - open: sign-in switched off (automated tests), any demo user can be picked
 * - clerk: a signed-in user with (or still setting up) their own account
 * - demo: a demo-trial session on a shared synthetic persona
 * - signed_out
 */
export const GET = handle(async () => {
  if (!authEnabled()) return Response.json({ mode: 'open' });
  const db = getDb();
  const s = await sessionFacts();

  if (s.demoUserId) {
    const [persona] = await db.select({ isDemo: users.isDemo }).from(users).where(eq(users.id, s.demoUserId));
    if (persona?.isDemo) {
      const me = await accountForUser(db, s.demoUserId);
      return Response.json({
        mode: 'demo',
        signedInWithClerk: Boolean(s.clerkUserId),
        user: { userId: me.userId, name: me.name, vpa: me.vpa, language: me.language },
      });
    }
  }

  if (s.clerkUserId) {
    const own = await findOwnAccount(db, s.clerkUserId);
    if (own) return Response.json({ mode: 'clerk', onboarded: true, user: own });
    const u = await currentUser();
    const name = [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.username || '';
    const email = u?.primaryEmailAddress?.emailAddress ?? '';
    const base = suggestHandle(u?.username || email || name || 'user');
    let handleSuggestion = base;
    for (let i = 1; i < 50; i++) {
      const [taken] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.vpa, `${handleSuggestion}@kavach`));
      if (!taken) break;
      handleSuggestion = `${base}${i}`;
    }
    return Response.json({ mode: 'clerk', onboarded: false, suggested: { name: name || base, handle: handleSuggestion } });
  }

  return Response.json({ mode: 'signed_out' });
}, { public: true });
