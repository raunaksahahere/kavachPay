import { z } from 'zod';
import { getDb } from '@/db/client';
import { getAi } from '@/lib/ai';
import { currentActor, handle, idempotencyKey, rateLimit, readJson, schemas } from '@/lib/api/http';
import { accountForUser } from '@/lib/api/users';
import { withIdempotency } from '@/lib/ledger/idempotency';
import { getAccountView, payToVpa } from '@/lib/ledger/payments';
import { paymentView } from '@/lib/api/views';

const body = z
  .object({
    userId: schemas.userId.optional(),
    payeeVpa: schemas.vpa,
    amountPaise: schemas.amountPaise,
    note: schemas.note,
    lang: schemas.lang,
    message: schemas.message.optional(),
  })
  .strict();

/** Starts a payment: validates, scores risk, stores the decision. No money moves here. */
export const POST = handle(async (req) => {
  const key = idempotencyKey(req);
  const input = await readJson(req, body);
  const actor = await currentActor(input.userId);
  await rateLimit(req, 'payment', actor.userId);
  const db = getDb();
  const me = await accountForUser(db, actor.userId);

  const result = await withIdempotency(
    db,
    { scope: `payments.create:${actor.userId}`, key, payload: input },
    async () => {
      const { txn, assessment } = await payToVpa(
        db,
        {
          payerAccountId: me.accountId,
          payeeVpa: input.payeeVpa,
          amountPaise: input.amountPaise,
          note: input.note,
          lang: input.lang,
          message: input.message,
        },
        { ai: getAi() },
      );
      const payee = await getAccountView(db, txn.payeeAccountId);
      return { status: 201, body: paymentView(txn, assessment, payee) };
    },
  );
  return Response.json(result.body, { status: result.status, headers: { 'Idempotent-Replayed': String(result.replayed) } });
});
