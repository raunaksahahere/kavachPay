import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { accounts, collectRequests } from '../src/db/schema';
import { verifyChain } from '../src/lib/audit/chain';
import { approveCollectRequest } from '../src/lib/ledger/payments';
import { generateDataset } from '../src/lib/seed/generate';
import { loadDataset } from '../src/lib/seed/load';
import { db } from './helpers';

const SEED = 20261114;
const anchor = new Date();

/** Fingerprint of everything except absolute timestamps. */
function fingerprint(seed: number, at: Date) {
  const d = generateDataset(seed, at);
  const body = JSON.stringify({
    users: d.users,
    accounts: d.accounts.map((a) => [a.id, a.vpa, a.kind, d.anchor.getTime() - a.openedAt.getTime()]),
    txns: d.txns.map((t) => [t.id, t.type, t.payerAccountId, t.payeeAccountId, t.amountPaise, t.note, t.scenario, d.anchor.getTime() - t.createdAt.getTime()]),
    collects: d.pendingCollects.map((c) => [c.id, c.amountPaise, c.note]),
  });
  return { hash: createHash('sha256').update(body).digest('hex'), counts: d.counts };
}

describe('seed generator', () => {
  it('is repeatable: same seed gives the same data, whenever it is run', () => {
    const a = fingerprint(SEED, anchor);
    const b = fingerprint(SEED, anchor);
    const later = fingerprint(SEED, new Date(anchor.getTime() + 3 * 86_400_000));
    expect(b).toEqual(a);
    expect(later).toEqual(a);
    expect(fingerprint(SEED + 1, anchor).hash).not.toBe(a.hash);
  });

  it('has the planned shape', () => {
    const d = generateDataset(SEED, anchor);
    expect(d.counts.users).toBeGreaterThanOrEqual(195);
    expect(d.counts.users).toBeLessThanOrEqual(210);
    expect(d.counts.transactions).toBeGreaterThan(4500);
    expect(d.counts.transactions).toBeLessThan(5500);
    expect(d.ring.muleAccountIds).toHaveLength(5);
    expect(d.users.filter((u) => u.isDemo).map((u) => u.name).sort()).toEqual(
      ['Asha Devi', 'Meera Das', 'Ravi Kumar', 'Refund Helpdesk', 'Sharma Kirana Store'].sort(),
    );
    expect(d.ring.victimAccountIds).toHaveLength(40);
    expect(d.counts['scenario:mule_ring']).toBe(40);
    expect(d.counts['scenario:refund_collect']).toBe(26);
    expect(d.counts['scenario:refund_collect_paraphrased']).toBe(22);
    expect(d.counts['scenario:takeover_burst']).toBe(28);
    expect(d.counts['scenario:legit_high_value']).toBeGreaterThanOrEqual(65);
    expect(d.txns.every((t) => t.createdAt <= d.anchor)).toBe(true);
  });
});

describe('seed loader', () => {
  let counts: Record<string, number>;

  beforeAll(async () => {
    counts = await loadDataset(db(), generateDataset(SEED, anchor));
  });

  it('loads the same counts on every run', async () => {
    const again = await loadDataset(db(), generateDataset(SEED, new Date()));
    expect(again).toEqual(counts);
    const rows = await db().execute(sql`
      SELECT (SELECT count(*) FROM users) AS users,
             (SELECT count(*) FROM txn_labels) AS txns,
             (SELECT count(*) FROM txn_labels WHERE is_fraud) AS fraud,
             (SELECT count(*) FROM risk_assessments) AS assessed`);
    expect(Number(rows.rows[0].users)).toBe(counts.users);
    expect(Number(rows.rows[0].txns)).toBe(counts.transactions);
    expect(Number(rows.rows[0].fraud)).toBe(counts.fraud);
    expect(Number(rows.rows[0].assessed)).toBe(counts.transactions);
  });

  it('keeps the ledger invariants', async () => {
    const unbalanced = await db().execute(
      sql`SELECT txn_id FROM ledger_entries GROUP BY txn_id HAVING SUM(amount_paise) <> 0`,
    );
    expect(unbalanced.rows).toHaveLength(0);
    const negative = await db().execute(sql`SELECT id FROM accounts WHERE kind = 'user' AND balance_paise < 0`);
    expect(negative.rows).toHaveLength(0);
    const drift = await db().execute(sql`
      SELECT a.id FROM accounts a
      LEFT JOIN (SELECT account_id, SUM(amount_paise) AS s FROM ledger_entries GROUP BY account_id) l
        ON l.account_id = a.id
      WHERE a.balance_paise <> COALESCE(l.s, 0)`);
    expect(drift.rows).toHaveLength(0);
    expect((await verifyChain(db())).ok).toBe(true);
  });

  it('sets up the demo: the refund request to Asha is held, in Hindi', async () => {
    const [asha] = await db().select().from(accounts).where(eq(accounts.vpa, 'asha@kavach'));
    const [mule] = await db().select().from(accounts).where(eq(accounts.vpa, 'refund.helpdesk@kavach'));
    const [request] = await db()
      .select()
      .from(collectRequests)
      .where(eq(collectRequests.requesterAccountId, mule.id));
    expect(request.payerAccountId).toBe(asha.id);
    expect(request.amountPaise).toBe(4_999_00);

    const { assessment, txn } = await approveCollectRequest(
      db(),
      { collectRequestId: request.id, payerAccountId: asha.id, lang: 'hi' },
      { ai: null },
    );
    expect(assessment.decision).toBe('hold');
    expect(txn.status).toBe('held');
    const ids = assessment.fired.map((r) => r.id);
    expect(ids).toContain('R1_DIRECTION_MISMATCH');
    expect(ids).toContain('R5_YOUNG_PAYEE');
    expect(ids).toContain('R6_MULE_FAN_IN');
    expect(assessment.explanation.headline).toContain('₹4,999');
  });
});
