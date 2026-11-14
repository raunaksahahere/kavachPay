import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { users } from '@/db/schema';
import { handle, rateLimit, readJson, schemas } from '@/lib/api/http';
import { DEMO_COOKIE, demoSessionsAvailable, signDemoSession } from '@/lib/auth/demo-session';
import { AppError } from '@/lib/errors';

/** Starts a demo trial on one shared synthetic persona (no Clerk account needed). */
export const POST = handle(async (req) => {
  const { userId } = await readJson(req, z.object({ userId: schemas.userId }).strict());
  await rateLimit(req, 'payment', 'demo-session');
  if (!demoSessionsAvailable()) throw new AppError(503, 'demo_unavailable', 'Demo trial is not configured on this server.');
  const [persona] = await getDb()
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.isDemo, true)));
  if (!persona) throw new AppError(404, 'not_a_demo_account', 'That is not a demo account.');
  const { value, expires } = await signDemoSession(persona.id);
  (await cookies()).set(DEMO_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  });
  return Response.json({ persona, expires });
}, { public: true });

/** Ends the demo trial. A signed-in user returns to their own account. */
export const DELETE = handle(async () => {
  (await cookies()).delete(DEMO_COOKIE);
  return Response.json({ ok: true });
}, { public: true });
