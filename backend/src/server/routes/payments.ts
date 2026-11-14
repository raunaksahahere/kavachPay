import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { getAi } from '@/lib/ai';
import { schemas } from '@/lib/api/schemas';
import { accountForUser } from '@/lib/api/users';
import { paymentView } from '@/lib/api/views';
import { withIdempotency } from '@/lib/ledger/idempotency';
import {
  approveCollectRequest,
  cancelPayment,
  confirmPayment,
  createCollectRequest,
  declineCollectRequest,
  getAccountView,
  payToVpa,
} from '@/lib/ledger/payments';
import { currentActor } from '../auth';
import { idempotencyKey, idempotentJson, param, rateLimit, readJson } from '../http';

export const paymentRoutes = new Hono();

/** Starts a payment: validates, scores risk, stores the decision. No money moves here. */
paymentRoutes.post('/payments', async (c) => {
  const key = idempotencyKey(c);
  const input = await readJson(
    c,
    z
      .object({
        userId: schemas.userId.optional(),
        payeeVpa: schemas.vpa,
        amountPaise: schemas.amountPaise,
        note: schemas.note,
        lang: schemas.lang,
        message: schemas.message.optional(),
      })
      .strict(),
  );
  const actor = await currentActor(c, input.userId);
  await rateLimit(c, 'payment', actor.userId);
  const db = getDb();
  const me = await accountForUser(db, actor.userId);
  const result = await withIdempotency(db, { scope: `payments.create:${actor.userId}`, key, payload: input }, async () => {
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
  });
  return idempotentJson(c, result);
});

/** The only endpoint that moves money: hold check, typed confirmation, PIN, then settlement. */
paymentRoutes.post('/payments/:id/confirm', async (c) => {
  const txnId = param(c, 'id');
  const key = idempotencyKey(c);
  const input = await readJson(
    c,
    z
      .object({ userId: schemas.userId.optional(), pin: schemas.pin, typedAmountPaise: z.number().int().nonnegative().optional() })
      .strict(),
  );
  const actor = await currentActor(c, input.userId);
  await rateLimit(c, 'pin', actor.userId);
  const db = getDb();
  const me = await accountForUser(db, actor.userId);
  const result = await withIdempotency(db, { scope: `payments.confirm:${actor.userId}`, key, payload: { txnId, ...input } }, async () => {
    const txn = await confirmPayment(db, { txnId, payerAccountId: me.accountId, pin: input.pin, typedAmountPaise: input.typedAmountPaise });
    return { status: 200, body: { txn: { id: txn.id, status: txn.status, amountPaise: txn.amountPaise, settledAt: txn.settledAt } } };
  });
  return idempotentJson(c, result);
});

paymentRoutes.post('/payments/:id/cancel', async (c) => {
  const txnId = param(c, 'id');
  const { userId } = await readJson(c, z.object({ userId: schemas.userId.optional() }).strict());
  const actor = await currentActor(c, userId);
  await rateLimit(c, 'payment', actor.userId);
  const db = getDb();
  const me = await accountForUser(db, actor.userId);
  const txn = await cancelPayment(db, { txnId, payerAccountId: me.accountId });
  return c.json({ txn: { id: txn.id, status: txn.status } });
});

paymentRoutes.post('/collect', async (c) => {
  const key = idempotencyKey(c);
  const input = await readJson(
    c,
    z.object({ userId: schemas.userId.optional(), payerVpa: schemas.vpa, amountPaise: schemas.amountPaise, note: schemas.note }).strict(),
  );
  const actor = await currentActor(c, input.userId);
  await rateLimit(c, 'payment', actor.userId);
  const db = getDb();
  const me = await accountForUser(db, actor.userId);
  const result = await withIdempotency(db, { scope: `collect.create:${actor.userId}`, key, payload: input }, async () => {
    const request = await createCollectRequest(db, {
      requesterAccountId: me.accountId,
      payerVpa: input.payerVpa,
      amountPaise: input.amountPaise,
      note: input.note,
    });
    return { status: 201, body: { request } };
  });
  return idempotentJson(c, result);
});

/** Approving a collect request starts an OUTGOING payment and runs the full risk check. */
paymentRoutes.post('/collect/:id/approve', async (c) => {
  const collectRequestId = param(c, 'id');
  const input = await readJson(c, z.object({ userId: schemas.userId.optional(), lang: schemas.lang }).strict());
  const actor = await currentActor(c, input.userId);
  await rateLimit(c, 'payment', actor.userId);
  const db = getDb();
  const me = await accountForUser(db, actor.userId);
  const { txn, assessment } = await approveCollectRequest(
    db,
    { collectRequestId, payerAccountId: me.accountId, lang: input.lang },
    { ai: getAi() },
  );
  const payee = await getAccountView(db, txn.payeeAccountId);
  return c.json(paymentView(txn, assessment, payee));
});

paymentRoutes.post('/collect/:id/decline', async (c) => {
  const collectRequestId = param(c, 'id');
  const { userId } = await readJson(c, z.object({ userId: schemas.userId.optional() }).strict());
  const actor = await currentActor(c, userId);
  await rateLimit(c, 'payment', actor.userId);
  const db = getDb();
  const me = await accountForUser(db, actor.userId);
  const request = await declineCollectRequest(db, { collectRequestId, payerAccountId: me.accountId });
  return c.json({ request: { id: request.id, status: request.status } });
});
