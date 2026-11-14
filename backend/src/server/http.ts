import type { Context } from 'hono';
import { z } from 'zod';
import { APP_CONFIG } from '@/config/app';
import { getDb } from '@/db/client';
import { idempotencyKeySchema } from '@/lib/api/schemas';
import { AppError } from '@/lib/errors';
import { enforceRateLimit, type RateLimitRule } from '@/lib/security/rate-limit';

export async function readJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new AppError(400, 'invalid_json', 'Request body must be JSON.');
  }
  return schema.parse(body);
}

export function query<T extends z.ZodType>(c: Context, schema: T): z.infer<T> {
  return schema.parse(c.req.query());
}

export function param(c: Context, name: string): string {
  return z.string().uuid().parse(c.req.param(name));
}

export function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  return (forwarded?.split(',')[0] ?? c.req.header('x-real-ip') ?? 'local').trim();
}

/** Per-user and per-IP fixed-window limits, stored in Postgres so they hold across instances. */
export async function rateLimit(c: Context, bucket: keyof typeof APP_CONFIG.rateLimits, subject: string): Promise<void> {
  const rule: RateLimitRule = APP_CONFIG.rateLimits[bucket];
  const db = getDb();
  await enforceRateLimit(db, `${bucket}:user:${subject}`, rule);
  await enforceRateLimit(db, `${bucket}:ip:${clientIp(c)}`, { ...rule, max: rule.max * 5 });
}

export function idempotencyKey(c: Context): string {
  const parsed = idempotencyKeySchema.safeParse(c.req.header('Idempotency-Key'));
  if (!parsed.success) {
    throw new AppError(400, 'idempotency_key_required', 'Send a unique Idempotency-Key header with this request.');
  }
  return parsed.data;
}

/** JSON response that also reports whether it was an idempotent replay. */
export function idempotentJson(c: Context, result: { status: number; body: unknown; replayed: boolean }) {
  c.header('Idempotent-Replayed', String(result.replayed));
  return c.json(result.body as object, result.status as 200);
}
