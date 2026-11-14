import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { getDb, type Db } from '../src/db/client';
import { accounts, ledgerEntries, transactions, users } from '../src/db/schema';
import { hashPin } from '../src/lib/security/pin';

export const TEST_PIN = '1234';
let cachedPinHash: string | null = null;

export async function pinHash(): Promise<string> {
  cachedPinHash ??= await hashPin(TEST_PIN);
  return cachedPinHash;
}

export function db(): Db {
  return getDb();
}

/** Empties every table and recreates the funding account. */
export async function resetDb(): Promise<{ treasuryId: string }> {
  const d = db();
  await d.execute(sql`
    TRUNCATE TABLE txn_labels, risk_assessments, ledger_entries, transactions, collect_requests,
      idempotency_keys, audit_log, ai_calls, ai_cache, rate_limits, eval_runs, accounts, users
    RESTART IDENTITY CASCADE
  `);
  const [treasury] = await d
    .insert(accounts)
    .values({ vpa: 'treasury@kavach', kind: 'system', balancePaise: 0 })
    .returning();
  return { treasuryId: treasury.id };
}

export type TestParty = { userId: string; accountId: string; vpa: string; name: string };

export async function makeUser(opts: {
  name: string;
  balancePaise?: number;
  openedDaysAgo?: number;
  treasuryId: string;
  at?: Date;
}): Promise<TestParty> {
  const d = db();
  const now = opts.at ?? new Date();
  const slug = opts.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.' + randomUUID().slice(0, 6);
  const [user] = await d
    .insert(users)
    .values({ name: opts.name, phone: '9000000000', pinHash: await pinHash() })
    .returning();
  const [account] = await d
    .insert(accounts)
    .values({
      userId: user.id,
      vpa: `${slug}@kavach`,
      openedAt: new Date(now.getTime() - (opts.openedDaysAgo ?? 400) * 86_400_000),
    })
    .returning();
  if (opts.balancePaise) await fund(opts.treasuryId, account.id, opts.balancePaise, now);
  return { userId: user.id, accountId: account.id, vpa: account.vpa, name: opts.name };
}

/** Inserts an already-settled transfer with its ledger entries, at a chosen time. */
export async function settledTransfer(
  fromId: string,
  toId: string,
  amountPaise: number,
  at: Date,
  type: 'pay' | 'collect' | 'funding' = 'pay',
  note = '',
): Promise<string> {
  const d = db();
  return d.transaction(async (tx) => {
    const [txn] = await tx
      .insert(transactions)
      .values({
        type,
        status: 'settled',
        payerAccountId: fromId,
        payeeAccountId: toId,
        amountPaise,
        note,
        createdAt: at,
        updatedAt: at,
        settledAt: at,
      })
      .returning();
    await tx
      .update(accounts)
      .set({ balancePaise: sql`${accounts.balancePaise} - ${amountPaise}` })
      .where(eq(accounts.id, fromId));
    await tx
      .update(accounts)
      .set({ balancePaise: sql`${accounts.balancePaise} + ${amountPaise}` })
      .where(eq(accounts.id, toId));
    await tx.insert(ledgerEntries).values([
      { txnId: txn.id, accountId: fromId, amountPaise: -amountPaise, createdAt: at },
      { txnId: txn.id, accountId: toId, amountPaise, createdAt: at },
    ]);
    return txn.id;
  });
}

export function fund(treasuryId: string, accountId: string, amountPaise: number, at = new Date()) {
  return settledTransfer(treasuryId, accountId, amountPaise, at, 'funding');
}

export async function balanceOf(accountId: string): Promise<number> {
  const [row] = await db().select().from(accounts).where(eq(accounts.id, accountId));
  return row.balancePaise;
}

export const minutesAgo = (n: number, from = new Date()) => new Date(from.getTime() - n * 60_000);
export const daysAgo = (n: number, from = new Date()) => new Date(from.getTime() - n * 86_400_000);
export const rupees = (n: number) => Math.round(n * 100);

/** The database's own error text; the ORM wraps driver errors, so look at the cause. */
export async function dbErrorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    const e = err as { message?: string; cause?: { message?: string } };
    return `${e.cause?.message ?? ''} ${e.message ?? ''}`;
  }
  return '';
}
