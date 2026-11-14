import { lt, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { rateLimits } from '@/db/schema';
import { AppError } from '@/lib/errors';

export type RateLimitRule = { max: number; windowSeconds: number };

/**
 * Fixed-window limiter backed by Postgres, so the limit holds across server
 * instances. One atomic upsert per call. Throws 429 when the window is full.
 */
export async function enforceRateLimit(db: Db, key: string, rule: RateLimitRule): Promise<void> {
  const windowMs = rule.windowSeconds * 1000;
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  if (row.count > rule.max) {
    const retryAfter = Math.ceil((windowStart.getTime() + windowMs - now) / 1000);
    throw new AppError(429, 'rate_limited', 'Too many requests. Please slow down.', {
      retryAfterSeconds: retryAfter,
    });
  }

  // Opportunistic cleanup of old windows; cheap and keeps the table small.
  if (row.count === 1 && Math.random() < 0.05) {
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now - 3_600_000)));
  }
}
