import { z } from 'zod';
import { getDb } from '@/db/client';
import { handle, query, schemas } from '@/lib/api/http';
import { walletView } from '@/lib/api/users';

export const GET = handle(async (req) => {
  const { userId } = query(req, z.object({ userId: schemas.userId }));
  return Response.json(await walletView(getDb(), userId));
});
