import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { auditLog } from '@/db/schema';
import { handle, query } from '@/lib/api/http';

export const GET = handle(async (req) => {
  const { limit } = query(req, z.object({ limit: z.coerce.number().int().min(1).max(200).default(40) }));
  const rows = await getDb().select().from(auditLog).orderBy(desc(auditLog.seq)).limit(limit);
  return Response.json({ items: rows });
});
