import { z } from 'zod';
import { getDb } from '@/db/client';
import { getAccountProfile, getPayeeNetwork } from '@/lib/analyst/queries';
import { handle, query } from '@/lib/api/http';
import { notFound } from '@/lib/errors';

const params = z.object({
  accountId: z.string().uuid(),
  hops: z.coerce.number().int().min(1).max(3).default(2),
  days: z.coerce.number().int().min(1).max(30).default(7),
});

export const GET = handle(async (req) => {
  const p = query(req, params);
  const db = getDb();
  const profile = await getAccountProfile(db, { accountId: p.accountId });
  if (!profile) throw notFound('Account');
  const network = await getPayeeNetwork(db, p.accountId, p.hops, p.days);
  return Response.json({ profile, ...network });
});
