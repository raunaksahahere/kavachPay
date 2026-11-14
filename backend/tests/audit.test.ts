import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { appendAuditStandalone, canonicalJson, verifyChain } from '../src/lib/audit/chain';
import { confirmPayment, payToVpa } from '../src/lib/ledger/payments';
import { db, dbErrorOf, makeUser, resetDb, rupees, TEST_PIN } from './helpers';

/** What an attacker with direct database access could do: bypass the append-only trigger. */
async function tamper(statement: ReturnType<typeof sql>) {
  await db().transaction(async (tx) => {
    await tx.execute(sql`ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only`);
    await tx.execute(statement);
    await tx.execute(sql`ALTER TABLE audit_log ENABLE TRIGGER audit_log_append_only`);
  });
}

beforeEach(async () => {
  const { treasuryId } = await resetDb();
  const alice = await makeUser({ name: 'Alice', balancePaise: rupees(1000), treasuryId });
  const bob = await makeUser({ name: 'Bob', treasuryId });
  for (const amount of [10, 20, 30]) {
    const { txn } = await payToVpa(
      db(),
      { payerAccountId: alice.accountId, payeeVpa: bob.vpa, amountPaise: rupees(amount), lang: 'en' },
      { ai: null },
    );
    await confirmPayment(db(), { txnId: txn.id, payerAccountId: alice.accountId, pin: TEST_PIN });
  }
});

describe('hash-chained audit log', () => {
  it('serialises payloads canonically', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: 'x' } })).toBe('{"a":{"c":"x","d":[1,2]},"b":1}');
  });

  it('records every state change and verifies cleanly', async () => {
    const result = await verifyChain(db());
    expect(result.ok).toBe(true);
    // 3 payments x (initiated, risk_checked, confirmed, settled)
    expect(result.count).toBe(12);
  });

  it('detects a modified row and points at that exact row', async () => {
    await tamper(sql`UPDATE audit_log SET payload = replace(payload, '2000', '1') WHERE seq = 5`);
    const result = await verifyChain(db());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.brokenAtSeq).toBe(5);
      expect(result.reason).toBe('content_changed');
    }
  });

  it('detects a modified actor even when the payload is untouched', async () => {
    await tamper(sql`UPDATE audit_log SET actor = 'nobody' WHERE seq = 9`);
    const result = await verifyChain(db());
    expect(result).toMatchObject({ ok: false, brokenAtSeq: 9 });
  });

  it('detects a deleted row at the row that follows it', async () => {
    await tamper(sql`DELETE FROM audit_log WHERE seq = 4`);
    const result = await verifyChain(db());
    expect(result).toMatchObject({ ok: false, brokenAtSeq: 5, reason: 'link_broken' });
  });

  it('refuses ordinary updates and deletes', async () => {
    expect(
      await dbErrorOf(db().execute(sql`UPDATE audit_log SET actor = 'x' WHERE seq = 1`)),
    ).toMatch(/append-only/);
    expect(await dbErrorOf(db().execute(sql`DELETE FROM audit_log WHERE seq = 1`))).toMatch(
      /append-only/,
    );
    expect((await verifyChain(db())).ok).toBe(true);
  });

  it('keeps the chain intact under concurrent appends', async () => {
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        appendAuditStandalone(db(), {
          actor: 'test',
          action: 'test.event',
          entityType: 'test',
          entityId: String(i),
          payload: { i },
        }),
      ),
    );
    const result = await verifyChain(db());
    expect(result.ok).toBe(true);
    expect(result.count).toBe(37);
  });
});
