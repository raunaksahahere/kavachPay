import { z } from 'zod';
import { getDb } from '@/db/client';
import { currentActor, handle, rateLimit, readJson, schemas } from '@/lib/api/http';
import { accountForUser } from '@/lib/api/users';
import { declineCollectRequest } from '@/lib/ledger/payments';

export const POST = handle(async (req, ctx: RouteContext<'/api/collect/[id]/decline'>) => {
  const { id } = await ctx.params;
  const collectRequestId = z.string().uuid().parse(id);
  const { userId } = await readJson(req, z.object({ userId: schemas.userId.optional() }).strict());
  const actor = await currentActor(userId);
  await rateLimit(req, 'payment', actor.userId);
  const db = getDb();
  const me = await accountForUser(db, actor.userId);
  const request = await declineCollectRequest(db, { collectRequestId, payerAccountId: me.accountId });
  return Response.json({ request: { id: request.id, status: request.status } });
});
