import { desc, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { aiCalls } from '@/db/schema';
import { verifyChain } from '@/lib/audit/chain';

type Row = Record<string, unknown>;

export type ProofCheck = { id: string; label: string; ok: boolean; detail: string };

/**
 * Live, read-only checks of the backend's guarantees, run against the real
 * database on request. Anyone can see that the ledger balances, no account is
 * overdrawn, balances match their ledger entries and the audit chain is intact.
 */
export async function backendProof(db: DbOrTx) {
  const started = Date.now();
  const q = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows as Row[];

  const [unbalanced] = await q(sql`
    SELECT count(*)::int AS n FROM (
      SELECT txn_id FROM ledger_entries GROUP BY txn_id HAVING SUM(amount_paise) <> 0) x`);
  const [total] = await q(sql`SELECT COALESCE(SUM(amount_paise), 0)::bigint AS s, count(*)::int AS n FROM ledger_entries`);
  const [drift] = await q(sql`
    SELECT count(*)::int AS n FROM accounts a
    LEFT JOIN (SELECT account_id, SUM(amount_paise) AS s FROM ledger_entries GROUP BY account_id) l ON l.account_id = a.id
    WHERE a.balance_paise <> COALESCE(l.s, 0)`);
  const [negative] = await q(sql`SELECT count(*)::int AS n FROM accounts WHERE kind = 'user' AND balance_paise < 0`);
  const [settledWithoutEntries] = await q(sql`
    SELECT count(*)::int AS n FROM transactions t
    WHERE t.status IN ('settled', 'reversed') AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.txn_id = t.id)`);
  const triggers = (await q(sql`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname`)).map((r) => String(r.tgname));
  const constraints = (
    await q(sql`SELECT conname FROM pg_constraint WHERE contype = 'c' AND conname IN ('accounts_balance_non_negative','txn_amount_positive','ledger_amount_non_zero') ORDER BY conname`)
  ).map((r) => String(r.conname));
  const chain = await verifyChain(db);
  const counts = (
    await q(sql`
      SELECT 'users' AS t, count(*)::int AS n FROM users UNION ALL
      SELECT 'accounts', count(*)::int FROM accounts UNION ALL
      SELECT 'transactions', count(*)::int FROM transactions UNION ALL
      SELECT 'ledger_entries', count(*)::int FROM ledger_entries UNION ALL
      SELECT 'risk_assessments', count(*)::int FROM risk_assessments UNION ALL
      SELECT 'collect_requests', count(*)::int FROM collect_requests UNION ALL
      SELECT 'idempotency_keys', count(*)::int FROM idempotency_keys UNION ALL
      SELECT 'audit_log', count(*)::int FROM audit_log UNION ALL
      SELECT 'ai_calls', count(*)::int FROM ai_calls`)
  ).map((r) => ({ table: String(r.t), rows: Number(r.n) }));
  const recentAi = await db.select().from(aiCalls).orderBy(desc(aiCalls.createdAt)).limit(10);

  const expectedTriggers = ['audit_log_append_only', 'ledger_entries_append_only', 'ledger_zero_sum'];
  const checks: ProofCheck[] = [
    { id: 'ledger_zero_sum', label: 'Every payment’s ledger entries sum to zero', ok: Number(unbalanced.n) === 0, detail: `${unbalanced.n} unbalanced payments` },
    { id: 'ledger_total', label: 'All ledger entries together sum to zero', ok: Number(total.s) === 0, detail: `sum ${total.s} over ${total.n} entries` },
    { id: 'balances_match_ledger', label: 'Every balance equals the sum of its ledger entries', ok: Number(drift.n) === 0, detail: `${drift.n} accounts differ` },
    { id: 'no_negative_balances', label: 'No customer balance is negative', ok: Number(negative.n) === 0, detail: `${negative.n} negative balances` },
    { id: 'settled_have_entries', label: 'Every settled payment has ledger entries', ok: Number(settledWithoutEntries.n) === 0, detail: `${settledWithoutEntries.n} without entries` },
    {
      id: 'database_guards',
      label: 'Database guards are installed (zero-sum and append-only triggers, CHECK constraints)',
      ok: expectedTriggers.every((t) => triggers.includes(t)) && constraints.length === 3,
      detail: `triggers: ${triggers.join(', ') || 'none'}; constraints: ${constraints.join(', ') || 'none'}`,
    },
    {
      id: 'audit_chain',
      label: 'Hash-chained audit log verifies end to end',
      ok: chain.ok,
      detail: chain.ok ? `${chain.count} rows, head ${chain.headHash.slice(0, 16)}…` : `broken at row ${chain.brokenAtSeq}: ${chain.reason}`,
    },
  ];

  return {
    ok: checks.every((c) => c.ok),
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    checks,
    tables: counts,
    recentAiCalls: recentAi.map((r) => ({
      kind: r.kind,
      model: r.model,
      status: r.status,
      latencyMs: r.latencyMs,
      at: r.createdAt,
    })),
  };
}
