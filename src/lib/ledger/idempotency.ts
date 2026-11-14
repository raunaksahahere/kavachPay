import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { idempotencyKeys } from '@/db/schema';
import { canonicalJson } from '@/lib/audit/chain';
import { AppError } from '@/lib/errors';

export type StoredResponse = { status: number; body: unknown };
export type IdempotentResult = StoredResponse & { replayed: boolean };

/** Hash of the request payload. Secrets such as the PIN are removed before hashing. */
export function requestHash(payload: Record<string, unknown>): string {
  const { pin: _pin, ...rest } = payload;
  void _pin;
  return createHash('sha256').update(canonicalJson(rest)).digest('hex');
}

/**
 * Runs `handler` at most once per (scope, key).
 *
 * - First request: claims the key, runs the handler, stores its response.
 * - Same key, same payload, finished: returns the stored response (replayed).
 * - Same key, same payload, still running: 409, the caller should retry later.
 * - Same key, different payload: 422, the key is being misused.
 *
 * The claim is an INSERT on the primary key, so two concurrent requests with
 * the same key cannot both win it.
 */
export async function withIdempotency(
  db: Db,
  opts: { scope: string; key: string; payload: Record<string, unknown> },
  handler: () => Promise<StoredResponse>,
): Promise<IdempotentResult> {
  const hash = requestHash(opts.payload);
  const where = and(eq(idempotencyKeys.scope, opts.scope), eq(idempotencyKeys.key, opts.key));

  const claimed = await db
    .insert(idempotencyKeys)
    .values({ scope: opts.scope, key: opts.key, requestHash: hash })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });

  if (claimed.length === 0) {
    const [existing] = await db.select().from(idempotencyKeys).where(where);
    if (!existing) {
      throw new AppError(409, 'request_in_progress', 'This request is already being processed.');
    }
    if (existing.requestHash !== hash) {
      throw new AppError(
        422,
        'idempotency_key_reused',
        'This Idempotency-Key was already used with a different request.',
      );
    }
    if (existing.state !== 'completed') {
      throw new AppError(409, 'request_in_progress', 'This request is already being processed.');
    }
    return {
      status: existing.responseStatus ?? 200,
      body: existing.responseBody,
      replayed: true,
    };
  }

  let response: StoredResponse;
  try {
    response = await handler();
  } catch (err) {
    if (err instanceof AppError) {
      // A definite business outcome: store it so a retry gets the same answer.
      response = { status: err.status, body: err.toBody() };
    } else {
      // Unknown failure: release the key so the client can safely retry.
      await db.delete(idempotencyKeys).where(where);
      throw err;
    }
  }

  await db
    .update(idempotencyKeys)
    .set({ state: 'completed', responseStatus: response.status, responseBody: response.body })
    .where(where);
  return { ...response, replayed: false };
}
