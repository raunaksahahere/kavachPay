import { desc } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { auditLog } from '@/db/schema';
import { getTransport } from '@/lib/ai';
import { runCopilot } from '@/lib/ai/copilot';
import {
  dashboardStats,
  getAccountProfile,
  getPayeeNetwork,
  getTransactionDetail,
  listFlagged,
  listSuspiciousPayees,
} from '@/lib/analyst/queries';
import { backendProof } from '@/lib/analyst/proof';
import { verifyChain } from '@/lib/audit/chain';
import { latestRuns } from '@/lib/eval/doc';
import { notFound } from '@/lib/errors';
import { param, query, rateLimit, readJson } from '../http';

/** Analyst dashboard: read-only views, audit verification, evaluation results and the AI copilot. */
export const analystRoutes = new Hono();

analystRoutes.get('/analyst/stats', async (c) => c.json(await dashboardStats(getDb())));

analystRoutes.get('/analyst/flagged', async (c) => {
  const f = query(
    c,
    z.object({
      decision: z.enum(['warn', 'hold']).optional(),
      sinceHours: z.coerce.number().int().min(1).max(24 * 60).optional(),
      payeeAccountId: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
  );
  return c.json({ items: await listFlagged(getDb(), f) });
});

analystRoutes.get('/analyst/txn/:id', async (c) => {
  const detail = await getTransactionDetail(getDb(), param(c, 'id'));
  if (!detail) throw notFound('Transaction');
  return c.json(detail);
});

analystRoutes.get('/analyst/network', async (c) => {
  const p = query(
    c,
    z.object({
      accountId: z.string().uuid(),
      hops: z.coerce.number().int().min(1).max(3).default(2),
      days: z.coerce.number().int().min(1).max(30).default(7),
    }),
  );
  const db = getDb();
  const profile = await getAccountProfile(db, { accountId: p.accountId });
  if (!profile) throw notFound('Account');
  return c.json({ profile, ...(await getPayeeNetwork(db, p.accountId, p.hops, p.days)) });
});

analystRoutes.get('/analyst/suspects', async (c) => c.json({ items: await listSuspiciousPayees(getDb()) }));

/** Live checks of the ledger, balances, database guards and audit chain. Read-only. */
analystRoutes.get('/analyst/proof', async (c) => c.json(await backendProof(getDb())));

analystRoutes.get('/audit', async (c) => {
  const { limit } = query(c, z.object({ limit: z.coerce.number().int().min(1).max(200).default(40) }));
  return c.json({ items: await getDb().select().from(auditLog).orderBy(desc(auditLog.seq)).limit(limit) });
});

analystRoutes.post('/audit/verify', async (c) => {
  const started = Date.now();
  const result = await verifyChain(getDb());
  return c.json({ ...result, durationMs: Date.now() - started, verifiedAt: new Date().toISOString() });
});

analystRoutes.get('/eval', async (c) => c.json(await latestRuns(getDb())));

/** G3: multi-step investigation with read-only tools; returns the answer and the full tool trace. */
analystRoutes.post('/copilot', async (c) => {
  const { question } = await readJson(c, z.object({ question: z.string().trim().min(3).max(1000) }).strict());
  await rateLimit(c, 'ai', 'analyst');
  // Without a Gemini key, runCopilot answers with status "disabled".
  return c.json(await runCopilot(getDb(), getTransport(), question));
});
