import { z } from 'zod';
import { getDb } from '@/db/client';
import { currentActor, handle, idempotencyKey, rateLimit, readJson, schemas } from '@/lib/api/http';
import { accountForUser } from '@/lib/api/users';
import { withIdempotency } from '@/lib/ledger/idempotency';
import { createCollectRequest } from '@/lib/ledger/payments';

const body = z
  .object({ userId: schemas.userId.optional(), payerVpa: schemas.vpa, amountPaise: schemas.amountPaise, note: schemas.note })
  .strict();

export const POST = handle(async (req) => {
  const key = idempotencyKey(req);
  const input = await readJson(req, body);
  const actor = await currentActor(input.userId);
  await rateLimit(req, 'payment', actor.userId);
  const db = getDb();
  const me = await accountForUser(db, actor.userId);
  const result = await withIdempotency(
    db,
    { scope: `collect.create:${actor.userId}`, key, payload: input },
    async () => {
      const request = await createCollectRequest(db, {
        requesterAccountId: me.accountId,
        payerVpa: input.payerVpa,
        amountPaise: input.amountPaise,
        note: input.note,
      });
      return { status: 201, body: { request } };
    },
  );
  return Response.json(result.body, { status: result.status });
});
