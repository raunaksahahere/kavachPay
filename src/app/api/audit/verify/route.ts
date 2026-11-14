import { getDb } from '@/db/client';
import { handle } from '@/lib/api/http';
import { verifyChain } from '@/lib/audit/chain';

/** Recomputes every hash in the audit chain and reports the first row that does not match. */
export const POST = handle(async () => {
  const started = Date.now();
  const result = await verifyChain(getDb());
  return Response.json({ ...result, durationMs: Date.now() - started, verifiedAt: new Date().toISOString() });
});
