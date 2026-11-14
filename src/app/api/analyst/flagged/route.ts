import { z } from 'zod';
import { getDb } from '@/db/client';
import { listFlagged } from '@/lib/analyst/queries';
import { handle, query } from '@/lib/api/http';

const params = z.object({
  decision: z.enum(['warn', 'hold']).optional(),
  sinceHours: z.coerce.number().int().min(1).max(24 * 60).optional(),
  payeeAccountId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const GET = handle(async (req) => {
  const f = query(req, params);
  return Response.json({ items: await listFlagged(getDb(), f) });
});
