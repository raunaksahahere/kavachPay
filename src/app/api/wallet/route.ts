import { z } from 'zod';
import { getDb } from '@/db/client';
import { currentActor, handle, query, schemas } from '@/lib/api/http';
import { walletView } from '@/lib/api/users';

export const GET = handle(async (req) => {
  const { userId } = query(req, z.object({ userId: schemas.userId.optional() }));
  const actor = await currentActor(userId);
  return Response.json({ ...(await walletView(getDb(), actor.userId)), mode: actor.mode });
});
