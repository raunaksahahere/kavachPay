import { z } from 'zod';
import { getDb } from '@/db/client';
import { handle, query, schemas } from '@/lib/api/http';
import { lookupVpa } from '@/lib/api/users';

export const GET = handle(async (req) => {
  const { vpa } = query(req, z.object({ vpa: schemas.vpa }));
  return Response.json(await lookupVpa(getDb(), vpa));
});
