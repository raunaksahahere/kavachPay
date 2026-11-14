import { eq, inArray, sql } from 'drizzle-orm';
import type { Db, Tx } from '@/db/client';
import {
  accounts,
  collectRequests,
  ledgerEntries,
  transactions,
  type Transaction,
} from '@/db/schema';
import { appendAudit } from '@/lib/audit/chain';
import { AppError, notFound } from '@/lib/errors';
import { assertTransition } from './state-machine';

/**
 * Locks the transaction row, then both account rows in ascending id order.
 * A single global lock order means two opposing transfers cannot deadlock.
 */
async function lockForMovement(tx: Tx, txnId: string) {
  const [txn] = await tx.select().from(transactions).where(eq(transactions.id, txnId)).for('update');
  if (!txn) throw notFound('Transaction');
  const locked = await tx
    .select()
    .from(accounts)
    .where(inArray(accounts.id, [txn.payerAccountId, txn.payeeAccountId]))
    .orderBy(accounts.id)
    .for('update');
  const payer = locked.find((a) => a.id === txn.payerAccountId);
  const payee = locked.find((a) => a.id === txn.payeeAccountId);
  if (!payer || !payee) throw notFound('Account');
  return { txn, payer, payee };
}

async function moveMoney(
  tx: Tx,
  txnId: string,
  fromId: string,
  toId: string,
  amountPaise: number,
  kind: 'transfer' | 'reversal',
) {
  await tx
    .update(accounts)
    .set({ balancePaise: sql`${accounts.balancePaise} - ${amountPaise}` })
    .where(eq(accounts.id, fromId));
  await tx
    .update(accounts)
    .set({ balancePaise: sql`${accounts.balancePaise} + ${amountPaise}` })
    .where(eq(accounts.id, toId));
  await tx.insert(ledgerEntries).values([
    { txnId, accountId: fromId, amountPaise: -amountPaise, kind },
    { txnId, accountId: toId, amountPaise, kind },
  ]);
}

export type SettleResult =
  | { outcome: 'settled'; txn: Transaction }
  | { outcome: 'failed'; txn: Transaction; reason: 'insufficient_funds' };

/**
 * Confirms and settles a risk-checked (or released) transaction in ONE database
 * transaction: the debit, the credit, both ledger entries, the status change and
 * the audit rows either all commit or none do.
 */
export async function confirmAndSettle(db: Db, txnId: string, actor: string): Promise<SettleResult> {
  return db.transaction(async (tx) => {
    const { txn, payer } = await lockForMovement(tx, txnId);
    assertTransition(txn.status, 'confirmed');
    const now = new Date();
    if (txn.status === 'held' && txn.holdUntil && txn.holdUntil > now) {
      throw new AppError(423, 'held', 'This payment is on hold for a cooling period.', {
        holdUntil: txn.holdUntil.toISOString(),
      });
    }

    if (payer.kind !== 'system' && payer.balancePaise < txn.amountPaise) {
      const [failed] = await tx
        .update(transactions)
        .set({ status: 'failed', failureReason: 'insufficient_funds', updatedAt: now })
        .where(eq(transactions.id, txnId))
        .returning();
      await appendAudit(tx, {
        actor,
        action: 'txn.failed',
        entityType: 'transaction',
        entityId: txnId,
        payload: { from: txn.status, reason: 'insufficient_funds' },
      });
      return { outcome: 'failed', txn: failed, reason: 'insufficient_funds' };
    }

    assertTransition('confirmed', 'settled');
    await moveMoney(tx, txnId, txn.payerAccountId, txn.payeeAccountId, txn.amountPaise, 'transfer');
    const [settled] = await tx
      .update(transactions)
      .set({ status: 'settled', settledAt: now, updatedAt: now })
      .where(eq(transactions.id, txnId))
      .returning();

    if (txn.collectRequestId) {
      await tx
        .update(collectRequests)
        .set({ status: 'approved', respondedAt: now })
        .where(eq(collectRequests.id, txn.collectRequestId));
    }

    await appendAudit(tx, {
      actor,
      action: 'txn.confirmed',
      entityType: 'transaction',
      entityId: txnId,
      payload: { from: txn.status },
    });
    await appendAudit(tx, {
      actor,
      action: 'txn.settled',
      entityType: 'transaction',
      entityId: txnId,
      payload: {
        amountPaise: txn.amountPaise,
        payer: txn.payerAccountId,
        payee: txn.payeeAccountId,
      },
    });
    return { outcome: 'settled', txn: settled };
  });
}

/** Reverses a settled transaction with opposite ledger entries. History is never edited. */
export async function reverseTransaction(
  db: Db,
  txnId: string,
  actor: string,
  reason: string,
): Promise<Transaction> {
  return db.transaction(async (tx) => {
    const { txn, payee } = await lockForMovement(tx, txnId);
    assertTransition(txn.status, 'reversed');
    if (payee.kind !== 'system' && payee.balancePaise < txn.amountPaise) {
      throw new AppError(
        409,
        'reversal_unfunded',
        'The payee no longer holds enough money to reverse this payment.',
      );
    }
    await moveMoney(tx, txnId, txn.payeeAccountId, txn.payerAccountId, txn.amountPaise, 'reversal');
    const [reversed] = await tx
      .update(transactions)
      .set({ status: 'reversed', failureReason: reason, updatedAt: new Date() })
      .where(eq(transactions.id, txnId))
      .returning();
    await appendAudit(tx, {
      actor,
      action: 'txn.reversed',
      entityType: 'transaction',
      entityId: txnId,
      payload: { reason, amountPaise: txn.amountPaise },
    });
    return reversed;
  });
}

/** Marks a not-yet-settled transaction as failed. No money has moved, so none moves back. */
export async function failTransaction(
  db: Db,
  txnId: string,
  actor: string,
  reason: string,
): Promise<Transaction> {
  return db.transaction(async (tx) => {
    const [txn] = await tx.select().from(transactions).where(eq(transactions.id, txnId)).for('update');
    if (!txn) throw notFound('Transaction');
    assertTransition(txn.status, 'failed');
    const [failed] = await tx
      .update(transactions)
      .set({ status: 'failed', failureReason: reason, updatedAt: new Date() })
      .where(eq(transactions.id, txnId))
      .returning();
    await appendAudit(tx, {
      actor,
      action: 'txn.failed',
      entityType: 'transaction',
      entityId: txnId,
      payload: { from: txn.status, reason },
    });
    return failed;
  });
}

/** Sum of all ledger entries for one transaction. Zero for every valid transaction. */
export async function ledgerSum(db: Db, txnId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${ledgerEntries.amountPaise}), 0)` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.txnId, txnId));
  return Number(row.total);
}
