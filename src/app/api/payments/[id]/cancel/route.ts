import { z } from 'zod';
import { getDb } from '@/db/client';
import { handle, rateLimit, readJson, schemas } from '@/lib/api/http';
import { accountForUser } from '@/lib/api/users';
import { cancelPayment } from '@/lib/ledger/payments';

export const POST = handle(async (req, ctx: RouteContext<'/api/payments/[id]/cancel'>) => {
  const { id } = await ctx.params;
  const txnId = z.string().uuid().parse(id);
  const { userId } = await readJson(req, z.object({ userId: schemas.userId }).strict());
  await rateLimit(req, 'payment', userId);
  const db = getDb();
  const me = await accountForUser(db, userId);
  const txn = await cancelPayment(db, { txnId, payerAccountId: me.accountId });
  return Response.json({ txn: { id: txn.id, status: txn.status } });
});
