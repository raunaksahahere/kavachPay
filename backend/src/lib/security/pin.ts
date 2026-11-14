import { hash, verify } from '@node-rs/argon2';
import { eq, sql } from 'drizzle-orm';
import { APP_CONFIG } from '@/config/app';
import type { Db } from '@/db/client';
import { users } from '@/db/schema';
import { appendAudit } from '@/lib/audit/chain';
import { AppError, notFound } from '@/lib/errors';

/** Numeric value of Algorithm.Argon2id in @node-rs/argon2 (a const enum, so not importable here). */
const ARGON2ID = 2;

export function hashPin(pin: string): Promise<string> {
  return hash(pin, { algorithm: ARGON2ID, ...APP_CONFIG.pin.argon2 });
}

/**
 * Checks a UPI PIN. Wrong attempts are counted in the database; after
 * `maxAttempts` the PIN is locked for `lockMinutes`. Throws AppError on failure.
 */
export async function verifyPinOrThrow(db: Db, userId: string, pin: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw notFound('User');

  const now = new Date();
  if (user.pinLockedUntil && user.pinLockedUntil > now) {
    throw new AppError(423, 'pin_locked', 'Too many wrong PIN attempts. Try again later.', {
      lockedUntil: user.pinLockedUntil.toISOString(),
    });
  }

  const ok = await verify(user.pinHash, pin).catch(() => false);
  if (ok) {
    if (user.failedPinAttempts > 0 || user.pinLockedUntil) {
      await db
        .update(users)
        .set({ failedPinAttempts: 0, pinLockedUntil: null })
        .where(eq(users.id, userId));
    }
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ failedPinAttempts: sql`${users.failedPinAttempts} + 1` })
      .where(eq(users.id, userId))
      .returning({ attempts: users.failedPinAttempts });
    const locked = updated.attempts >= APP_CONFIG.pin.maxAttempts;
    const lockedUntil = locked
      ? new Date(now.getTime() + APP_CONFIG.pin.lockMinutes * 60_000)
      : null;
    if (locked) {
      await tx
        .update(users)
        .set({ pinLockedUntil: lockedUntil, failedPinAttempts: 0 })
        .where(eq(users.id, userId));
    }
    await appendAudit(tx, {
      actor: `user:${userId}`,
      action: locked ? 'pin.locked' : 'pin.failed',
      entityType: 'user',
      entityId: userId,
      payload: { attempts: updated.attempts },
    });
    return { attempts: updated.attempts, lockedUntil };
  });

  if (result.lockedUntil) {
    throw new AppError(423, 'pin_locked', 'Too many wrong PIN attempts. Try again later.', {
      lockedUntil: result.lockedUntil.toISOString(),
    });
  }
  throw new AppError(401, 'wrong_pin', 'Incorrect UPI PIN.', {
    attemptsLeft: APP_CONFIG.pin.maxAttempts - result.attempts,
  });
}
