import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { accounts, ledgerEntries, transactions } from '../src/db/schema';
import { AppError } from '../src/lib/errors';
import { withIdempotency } from '../src/lib/ledger/idempotency';
import { confirmPayment, payToVpa } from '../src/lib/ledger/payments';
import { canTransition, TRANSITIONS } from '../src/lib/ledger/state-machine';
import { confirmAndSettle, ledgerSum, reverseTransaction } from '../src/lib/ledger/transfer';
import {
  balanceOf,
  db,
  dbErrorOf,
  makeUser,
  resetDb,
  rupees,
  TEST_PIN,
  type TestParty,
} from './helpers';

const noAi = { ai: null };
let treasuryId: string;
let alice: TestParty;
let bob: TestParty;

async function initiate(from: TestParty, to: TestParty, amountPaise: number) {
  const { txn } = await payToVpa(
    db(),
    { payerAccountId: from.accountId, payeeVpa: to.vpa, amountPaise, lang: 'en' },
    noAi,
  );
  return txn;
}

beforeEach(async () => {
  ({ treasuryId } = await resetDb());
  alice = await makeUser({ name: 'Alice', balancePaise: rupees(1000), treasuryId });
  bob = await makeUser({ name: 'Bob', balancePaise: rupees(1000), treasuryId });
  // Bob has paid Alice before and Alice has paid Bob, so these are known payees.
});

describe('state machine', () => {
  it('allows only the documented transitions', () => {
    expect(canTransition('initiated', 'risk_checked')).toBe(true);
    expect(canTransition('risk_checked', 'held')).toBe(true);
    expect(canTransition('risk_checked', 'confirmed')).toBe(true);
    expect(canTransition('held', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'settled')).toBe(true);
    expect(canTransition('settled', 'reversed')).toBe(true);

    expect(canTransition('initiated', 'settled')).toBe(false);
    expect(canTransition('initiated', 'confirmed')).toBe(false);
    expect(canTransition('settled', 'confirmed')).toBe(false);
    expect(canTransition('held', 'settled')).toBe(false);
    expect(TRANSITIONS.failed).toEqual([]);
    expect(TRANSITIONS.reversed).toEqual([]);
  });

  it('refuses to settle a transaction that has not been risk checked', async () => {
    const [raw] = await db()
      .insert(transactions)
      .values({
        type: 'pay',
        payerAccountId: alice.accountId,
        payeeAccountId: bob.accountId,
        amountPaise: rupees(10),
      })
      .returning();
    await expect(confirmAndSettle(db(), raw.id, 'test')).rejects.toMatchObject({ code: 'invalid_state' });
    expect(await balanceOf(alice.accountId)).toBe(rupees(1000));
  });
});

describe('double-entry settlement', () => {
  it('moves money once, with entries that sum to zero', async () => {
    const txn = await initiate(alice, bob, rupees(250));
    expect(txn.status).toBe('risk_checked');

    const settled = await confirmPayment(db(), {
      txnId: txn.id,
      payerAccountId: alice.accountId,
      pin: TEST_PIN,
    });
    expect(settled.status).toBe('settled');
    expect(await balanceOf(alice.accountId)).toBe(rupees(750));
    expect(await balanceOf(bob.accountId)).toBe(rupees(1250));

    const entries = await db().select().from(ledgerEntries).where(eq(ledgerEntries.txnId, txn.id));
    expect(entries.map((e) => e.amountPaise).sort((a, b) => a - b)).toEqual([-rupees(250), rupees(250)]);
    expect(await ledgerSum(db(), txn.id)).toBe(0);
  });

  it('keeps every transaction and the whole ledger at zero sum', async () => {
    for (const amount of [10, 20, 30]) {
      const txn = await initiate(alice, bob, rupees(amount));
      await confirmPayment(db(), { txnId: txn.id, payerAccountId: alice.accountId, pin: TEST_PIN });
    }
    const perTxn = await db().execute(
      sql`SELECT txn_id, SUM(amount_paise) AS total FROM ledger_entries GROUP BY txn_id HAVING SUM(amount_paise) <> 0`,
    );
    expect(perTxn.rows).toHaveLength(0);
    const total = await db().execute(sql`SELECT COALESCE(SUM(amount_paise),0) AS total FROM ledger_entries`);
    expect(Number(total.rows[0].total)).toBe(0);
    // Account balances equal the sum of their ledger entries.
    const drift = await db().execute(sql`
      SELECT a.id FROM accounts a
      LEFT JOIN (SELECT account_id, SUM(amount_paise) AS s FROM ledger_entries GROUP BY account_id) l
        ON l.account_id = a.id
      WHERE a.balance_paise <> COALESCE(l.s, 0)`);
    expect(drift.rows).toHaveLength(0);
  });

  it('fails cleanly on insufficient funds without moving money', async () => {
    const txn = await initiate(alice, bob, rupees(5000));
    await expect(
      confirmPayment(db(), {
        txnId: txn.id,
        payerAccountId: alice.accountId,
        pin: TEST_PIN,
        typedAmountPaise: rupees(5000),
      }),
    ).rejects.toMatchObject({ code: 'insufficient_funds' });
    const [after] = await db().select().from(transactions).where(eq(transactions.id, txn.id));
    expect(after.status).toBe('failed');
    expect(await balanceOf(alice.accountId)).toBe(rupees(1000));
    expect(await ledgerSum(db(), txn.id)).toBe(0);
  });

  it('reverses a settled payment with opposite entries', async () => {
    const txn = await initiate(alice, bob, rupees(100));
    await confirmPayment(db(), { txnId: txn.id, payerAccountId: alice.accountId, pin: TEST_PIN });
    const reversed = await reverseTransaction(db(), txn.id, 'analyst', 'confirmed fraud');
    expect(reversed.status).toBe('reversed');
    expect(await balanceOf(alice.accountId)).toBe(rupees(1000));
    expect(await balanceOf(bob.accountId)).toBe(rupees(1000));
    const entries = await db().select().from(ledgerEntries).where(eq(ledgerEntries.txnId, txn.id));
    expect(entries).toHaveLength(4);
    expect(await ledgerSum(db(), txn.id)).toBe(0);
    await expect(reverseTransaction(db(), txn.id, 'analyst', 'again')).rejects.toBeInstanceOf(AppError);
  });
});

describe('database guards', () => {
  it('rejects a negative customer balance at the database level', async () => {
    const error = await dbErrorOf(
      db().update(accounts).set({ balancePaise: -1 }).where(eq(accounts.id, alice.accountId)),
    );
    expect(error).toMatch(/accounts_balance_non_negative/);
    expect(await balanceOf(alice.accountId)).toBe(rupees(1000));
  });

  it('rejects ledger entries that do not sum to zero', async () => {
    const txn = await initiate(alice, bob, rupees(10));
    const error = await dbErrorOf(
      db().insert(ledgerEntries).values({ txnId: txn.id, accountId: alice.accountId, amountPaise: -500 }),
    );
    expect(error).toMatch(/sum to -500/);
  });

  it('does not allow ledger entries to be edited or deleted', async () => {
    const txn = await initiate(alice, bob, rupees(10));
    await confirmPayment(db(), { txnId: txn.id, payerAccountId: alice.accountId, pin: TEST_PIN });
    expect(
      await dbErrorOf(
        db().update(ledgerEntries).set({ amountPaise: 1 }).where(eq(ledgerEntries.txnId, txn.id)),
      ),
    ).toMatch(/append-only/);
    expect(
      await dbErrorOf(db().delete(ledgerEntries).where(eq(ledgerEntries.txnId, txn.id))),
    ).toMatch(/append-only/);
  });
});

describe('idempotency (double submit)', () => {
  const confirmWithKey = (txnId: string, key: string) =>
    withIdempotency(
      db(),
      { scope: 'payments.confirm', key, payload: { txnId, payerAccountId: alice.accountId } },
      async () => {
        const txn = await confirmPayment(db(), {
          txnId,
          payerAccountId: alice.accountId,
          pin: TEST_PIN,
        });
        return { status: 200, body: { txnId: txn.id, status: txn.status } };
      },
    );

  it('debits once when the same request is sent twice in a row', async () => {
    const txn = await initiate(alice, bob, rupees(300));
    const key = randomUUID();
    const first = await confirmWithKey(txn.id, key);
    const second = await confirmWithKey(txn.id, key);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.body).toEqual(first.body);
    expect(await balanceOf(alice.accountId)).toBe(rupees(700));
    expect(await balanceOf(bob.accountId)).toBe(rupees(1300));
    const entries = await db().select().from(ledgerEntries).where(eq(ledgerEntries.txnId, txn.id));
    expect(entries).toHaveLength(2);
  });

  it('debits once when the same request is sent five times at the same moment', async () => {
    const txn = await initiate(alice, bob, rupees(300));
    const key = randomUUID();
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => confirmWithKey(txn.id, key)));

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      if (r.status === 'rejected') expect(r.reason).toMatchObject({ code: 'request_in_progress' });
    }
    expect(await balanceOf(alice.accountId)).toBe(rupees(700));
    const entries = await db().select().from(ledgerEntries).where(eq(ledgerEntries.txnId, txn.id));
    expect(entries).toHaveLength(2);
  });

  it('does not debit twice even with two DIFFERENT keys for the same payment', async () => {
    const txn = await initiate(alice, bob, rupees(300));
    const results = await Promise.all([
      confirmWithKey(txn.id, randomUUID()),
      confirmWithKey(txn.id, randomUUID()),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await balanceOf(alice.accountId)).toBe(rupees(700));
  });

  it('rejects a key reused with a different payload', async () => {
    const txn = await initiate(alice, bob, rupees(10));
    const key = randomUUID();
    await confirmWithKey(txn.id, key);
    await expect(
      withIdempotency(
        db(),
        { scope: 'payments.confirm', key, payload: { txnId: 'something-else' } },
        async () => ({ status: 200, body: {} }),
      ),
    ).rejects.toMatchObject({ code: 'idempotency_key_reused', status: 422 });
  });
});

describe('concurrency', () => {
  it('never lets a balance go negative under concurrent spending', async () => {
    // Alice has ₹1,000. Twenty ₹100 payments race; exactly ten can succeed.
    const txns = [];
    for (let i = 0; i < 20; i++) txns.push(await initiate(alice, bob, rupees(100)));

    const results = await Promise.allSettled(
      txns.map((t) => confirmAndSettle(db(), t.id, 'test')),
    );
    const outcomes = results.map((r) => (r.status === 'fulfilled' ? r.value.outcome : 'error'));
    expect(outcomes.filter((o) => o === 'settled')).toHaveLength(10);
    expect(outcomes.filter((o) => o === 'failed')).toHaveLength(10);
    expect(outcomes).not.toContain('error');

    expect(await balanceOf(alice.accountId)).toBe(0);
    expect(await balanceOf(bob.accountId)).toBe(rupees(2000));
    const negative = await db().execute(
      sql`SELECT id FROM accounts WHERE kind = 'user' AND balance_paise < 0`,
    );
    expect(negative.rows).toHaveLength(0);
  });

  it('does not deadlock on opposing transfers', async () => {
    const txns = [];
    for (let i = 0; i < 8; i++) {
      txns.push(await initiate(alice, bob, rupees(10)));
      txns.push(await initiate(bob, alice, rupees(10)));
    }
    const results = await Promise.allSettled(txns.map((t) => confirmAndSettle(db(), t.id, 'test')));
    expect(results.every((r) => r.status === 'fulfilled' && r.value.outcome === 'settled')).toBe(true);
    expect(await balanceOf(alice.accountId)).toBe(rupees(1000));
    expect(await balanceOf(bob.accountId)).toBe(rupees(1000));
    void treasuryId;
  });
});
