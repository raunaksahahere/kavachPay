import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { authEnabled } from '@/config/auth';
import { getDb } from '@/db/client';
import { accounts, users } from '@/db/schema';
import { createOwnAccount, findOwnAccount, HANDLE_PATTERN, suggestHandle } from '@/lib/accounts/onboard';
import { schemas } from '@/lib/api/schemas';
import { accountForUser, listDemoUsers, lookupVpa, walletView } from '@/lib/api/users';
import { DEMO_COOKIE, demoSessionsAvailable, signDemoSession } from '@/lib/auth/demo-session';
import { AppError } from '@/lib/errors';
import { clerkProfile, currentActor, sessionFacts } from '../auth';
import { query, rateLimit, readJson } from '../http';

export const accountRoutes = new Hono();

/**
 * Who is using the app: open (sign-in off, tests), clerk (own account, or
 * still setting it up), demo (a shared synthetic persona) or signed_out.
 */
accountRoutes.get('/session', async (c) => {
  if (!authEnabled()) return c.json({ mode: 'open' });
  const db = getDb();
  const s = await sessionFacts(c);

  if (s.demoUserId) {
    const [persona] = await db.select({ isDemo: users.isDemo }).from(users).where(eq(users.id, s.demoUserId));
    if (persona?.isDemo) {
      const me = await accountForUser(db, s.demoUserId);
      return c.json({
        mode: 'demo',
        signedInWithClerk: Boolean(s.clerkUserId),
        user: { userId: me.userId, name: me.name, vpa: me.vpa, language: me.language },
      });
    }
  }

  if (s.clerkUserId) {
    const own = await findOwnAccount(db, s.clerkUserId);
    if (own) return c.json({ mode: 'clerk', onboarded: true, user: own });
    const profile = await clerkProfile(s.clerkUserId);
    const base = suggestHandle(profile.username || profile.email || profile.name || 'user');
    let handle = base;
    for (let i = 1; i < 50; i++) {
      const [taken] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.vpa, `${handle}@kavach`));
      if (!taken) break;
      handle = `${base}${i}`;
    }
    return c.json({ mode: 'clerk', onboarded: false, suggested: { name: profile.name || base, handle } });
  }

  return c.json({ mode: 'signed_out' });
});

/** Creates the signed-in user's own account, once. Demo-trial sessions cannot do this. */
accountRoutes.post('/onboard', async (c) => {
  const input = await readJson(
    c,
    z
      .object({
        name: z.string().trim().min(1).max(80),
        handle: z.string().trim().toLowerCase().regex(HANDLE_PATTERN, 'Use 3 to 30 letters, numbers, dot, dash or underscore'),
        pin: schemas.pin,
        language: schemas.lang,
      })
      .strict(),
  );
  const { clerkUserId } = await sessionFacts(c);
  if (!clerkUserId) throw new AppError(401, 'clerk_required', 'Sign in to create your own account.');
  await rateLimit(c, 'pin', clerkUserId);
  const own = await createOwnAccount(getDb(), { clerkUserId, ...input });
  return c.json({ user: own }, 201);
});

/** Shared synthetic personas for the demo trial (synthetic names and UPI IDs only). */
accountRoutes.get('/demo-users', async (c) => c.json({ users: await listDemoUsers(getDb()) }));

/** Starts a demo trial. Browsers get an HttpOnly cookie; other clients can send the token as X-Demo-Session. */
accountRoutes.post('/demo-session', async (c) => {
  const { userId } = await readJson(c, z.object({ userId: schemas.userId }).strict());
  await rateLimit(c, 'payment', 'demo-session');
  if (!demoSessionsAvailable()) throw new AppError(503, 'demo_unavailable', 'Demo trial is not configured on this server.');
  const [persona] = await getDb()
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.isDemo, true)));
  if (!persona) throw new AppError(404, 'not_a_demo_account', 'That is not a demo account.');
  const { value, expires } = await signDemoSession(persona.id);
  setCookie(c, DEMO_COOKIE, value, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  });
  return c.json({ persona, expires, token: value });
});

accountRoutes.delete('/demo-session', (c) => {
  deleteCookie(c, DEMO_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

accountRoutes.get('/wallet', async (c) => {
  const { userId } = query(c, z.object({ userId: schemas.userId.optional() }));
  const actor = await currentActor(c, userId);
  return c.json({ ...(await walletView(getDb(), actor.userId)), mode: actor.mode });
});

accountRoutes.get('/vpa', async (c) => {
  const { vpa } = query(c, z.object({ vpa: schemas.vpa }));
  return c.json(await lookupVpa(getDb(), vpa));
});
