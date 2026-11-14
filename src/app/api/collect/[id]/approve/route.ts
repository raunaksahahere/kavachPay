import { z } from 'zod';
import { getDb } from '@/db/client';
import { getAi } from '@/lib/ai';
import { currentActor, handle, rateLimit, readJson, schemas } from '@/lib/api/http';
import { accountForUser } from '@/lib/api/users';
import { paymentView } from '@/lib/api/views';
import { approveCollectRequest, getAccountView } from '@/lib/ledger/payments';

/**
 * Approving a collect request starts an OUTGOING payment and runs the full
 * risk check. Repeated taps return the payment already in progress.
 */
export const POST = handle(async (req, ctx: RouteContext<'/api/collect/[id]/approve'>) => {
  const { id } = await ctx.params;
  const collectRequestId = z.string().uuid().parse(id);
  const input = await readJson(req, z.object({ userId: schemas.userId.optional(), lang: schemas.lang }).strict());
  const actor = await currentActor(input.userId);
  await rateLimit(req, 'payment', actor.userId);
  const db = getDb();
  const me = await accountForUser(db, actor.userId);
  const { txn, assessment } = await approveCollectRequest(
    db,
    { collectRequestId, payerAccountId: me.accountId, lang: input.lang },
    { ai: getAi() },
  );
  const payee = await getAccountView(db, txn.payeeAccountId);
  return Response.json(paymentView(txn, assessment, payee));
});
