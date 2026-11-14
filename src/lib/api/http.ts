import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';
import { z, ZodError } from 'zod';
import { APP_CONFIG } from '@/config/app';
import { authEnabled } from '@/config/auth';
import { getDb } from '@/db/client';
import { resolveActor, type Actor } from '@/lib/auth/actor';
import { DEMO_COOKIE, verifyDemoSession } from '@/lib/auth/demo-session';
import { AppError } from '@/lib/errors';
import { enforceRateLimit, type RateLimitRule } from '@/lib/security/rate-limit';

/**
 * Wraps a route handler. Every API response reads live data, so it waits for a
 * real request (never prerendered). Expected errors become JSON with their
 * status, anything else a generic 500; Next.js's own control-flow errors are
 * passed through untouched.
 */
export function handle<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<Response>, opts: { public?: boolean } = {}) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    await connection();
    try {
      // Defence in depth: the proxy already requires a session; check again here.
      if (authEnabled() && !opts.public) {
        const s = await sessionFacts();
        if (!s.clerkUserId && !s.demoUserId) throw new AppError(401, 'unauthenticated', 'Please sign in.');
      }
      return await fn(req, ctx);
    } catch (err) {
      unstable_rethrow(err);
      if (err instanceof AppError) {
        const headers: Record<string, string> = {};
        const retry = err.details?.retryAfterSeconds;
        if (typeof retry === 'number') headers['Retry-After'] = String(retry);
        return Response.json(err.toBody(), { status: err.status, headers });
      }
      if (err instanceof ZodError) {
        return Response.json(
          {
            error: {
              code: 'invalid_request',
              message: 'The request is not valid.',
              issues: err.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message })),
            },
          },
          { status: 400 },
        );
      }
      console.error(err);
      return Response.json(
        { error: { code: 'internal', message: 'Something went wrong. No money was moved.' } },
        { status: 500 },
      );
    }
  };
}

export async function readJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError(400, 'invalid_json', 'Request body must be JSON.');
  }
  return schema.parse(body);
}

export function query<T extends z.ZodType>(req: Request, schema: T): z.infer<T> {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  return schema.parse(params);
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return (forwarded?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'local').trim();
}

export async function rateLimit(
  req: Request,
  bucket: keyof typeof APP_CONFIG.rateLimits,
  subject: string,
): Promise<void> {
  const rule: RateLimitRule = APP_CONFIG.rateLimits[bucket];
  const db = getDb();
  await enforceRateLimit(db, `${bucket}:user:${subject}`, rule);
  await enforceRateLimit(db, `${bucket}:ip:${clientIp(req)}`, { ...rule, max: rule.max * 5 });
}

const idempotencyKeySchema = z.string().min(8).max(255).regex(/^[A-Za-z0-9_\-:.]+$/);

export function idempotencyKey(req: Request): string {
  const key = req.headers.get('Idempotency-Key');
  const parsed = idempotencyKeySchema.safeParse(key);
  if (!parsed.success) {
    throw new AppError(400, 'idempotency_key_required', 'Send a unique Idempotency-Key header with this request.');
  }
  return parsed.data;
}

export const schemas = {
  userId: z.string().uuid(),
  lang: z.enum(['en', 'hi', 'bn']),
  vpa: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9._-]+@[a-z0-9]+$/, 'Enter a UPI ID like name@kavach'),
  amountPaise: z.number().int().positive().max(APP_CONFIG.maxAmountPaise),
  note: z.string().trim().max(APP_CONFIG.maxNoteLength).default(''),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4 to 6 digits'),
  message: z
    .object({
      text: z.string().max(2000).optional(),
      image: z
        .object({
          mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
          dataBase64: z
            .string()
            .max(Math.ceil((4 * 1024 * 1024 * 4) / 3) + 4, 'Image is larger than 4 MB')
            .regex(/^[A-Za-z0-9+/=]+$/, 'Image must be base64'),
        })
        .optional(),
    })
    .refine((m) => (m.text && m.text.trim()) || m.image, 'Paste a message or attach a screenshot'),
};

/** The verified Clerk user and demo-trial persona for this request (either may be null). */
export async function sessionFacts(): Promise<{ clerkUserId: string | null; demoUserId: string | null }> {
  if (!authEnabled()) return { clerkUserId: null, demoUserId: null };
  const { userId } = await auth();
  const jar = await cookies();
  const demo = await verifyDemoSession(jar.get(DEMO_COOKIE)?.value);
  return { clerkUserId: userId ?? null, demoUserId: demo?.userId ?? null };
}

/**
 * Whose account this request acts on, decided by the server: the signed-in
 * user's own account, or the demo persona in a demo-trial session. The client's
 * `userId` is only used when sign-in is switched off (automated tests).
 */
export async function currentActor(requestedUserId?: string): Promise<Actor> {
  const s = await sessionFacts();
  return resolveActor(getDb(), { authEnabled: authEnabled(), ...s, requestedUserId });
}
