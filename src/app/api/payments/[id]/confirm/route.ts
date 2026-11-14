import { z } from 'zod';
import { getDb } from '@/db/client';
import { currentActor, handle, idempotencyKey, rateLimit, readJson, schemas } from '@/lib/api/http';
import { accountForUser } from '@/lib/api/users';
import { withIdempotency } from '@/lib/ledger/idempotency';
import { confirmPayment } from '@/lib/ledger/payments';

const body = z
  .object({
    userId: schemas.userId.optional(),
    pin: schemas.pin,
    typedAmountPaise: z.number().int().nonnegative().optional(),
  })
  .strict();

/** The only endpoint that moves money: hold check, typed confirmation, PIN, then settlement. */
export const POST = handle(async (req, ctx: RouteContext<'/api/payments/[id]/confirm'>) => {
  const { id } = await ctx.params;
  const txnId = z.string().uuid().parse(id);
  const key = idempotencyKey(req);
  const input = await readJson(req, body);
  const actor = await currentActor(input.userId);
  await rateLimit(req, 'pin', actor.userId);
  const db = getDb();
  const me = await accountForUser(db, actor.userId);

  const result = await withIdempotency(
    db,
    { scope: `payments.confirm:${actor.userId}`, key, payload: { txnId, ...input } },
    async () => {
      const txn = await confirmPayment(db, {
        txnId,
        payerAccountId: me.accountId,
        pin: input.pin,
        typedAmountPaise: input.typedAmountPaise,
      });
      return {
        status: 200,
        body: { txn: { id: txn.id, status: txn.status, amountPaise: txn.amountPaise, settledAt: txn.settledAt } },
      };
    },
  );
  return Response.json(result.body, { status: result.status, headers: { 'Idempotent-Replayed': String(result.replayed) } });
});
