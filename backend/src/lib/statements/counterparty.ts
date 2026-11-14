import { and, asc, eq, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '@/db/client';
import { accounts, riskAssessments, transactions, users } from '@/db/schema';
import { AppError } from '@/lib/errors';
import { reasonText } from '@/lib/risk/explain';
import type { FiredRule } from '@/lib/risk/types';

export type StatementParty = { accountId: string; name: string; vpa: string; openedAt: Date };

export type StatementRow = {
  id: string;
  createdAt: Date;
  settledAt: Date | null;
  type: 'pay' | 'collect' | 'funding';
  direction: 'sent' | 'received';
  amountPaise: number;
  status: string;
  note: string;
  failureReason: string | null;
  riskScore: number | null;
  riskDecision: 'allow' | 'warn' | 'hold' | null;
  /** English reasons from the stored rule trace (warn and hold only). */
  reasons: string[];
};

export type CounterpartyStatement = {
  me: StatementParty;
  counterparty: StatementParty;
  selectedTxnId: string;
  rows: StatementRow[];
  totals: { sentPaise: number; receivedPaise: number; count: number; held: number; warned: number; failedOrCancelled: number };
  generatedAt: Date;
};

async function party(db: Db, accountId: string): Promise<StatementParty> {
  const [row] = await db
    .select({ accountId: accounts.id, vpa: accounts.vpa, openedAt: accounts.openedAt, name: users.name })
    .from(accounts)
    .leftJoin(users, eq(users.id, accounts.userId))
    .where(eq(accounts.id, accountId));
  if (!row) throw new AppError(404, 'not_found', 'Account not found.');
  return { accountId: row.accountId, vpa: row.vpa, openedAt: row.openedAt, name: row.name ?? row.vpa };
}

/**
 * Every transaction, in both directions, between the signed-in account and
 * the other party of the selected transaction. Only a party to the selected
 * transaction can ask, and only their own transactions with that party are
 * returned.
 */
export async function counterpartyStatement(db: Db, input: { meAccountId: string; txnId: string; now?: Date }): Promise<CounterpartyStatement> {
  const [selected] = await db
    .select({ id: transactions.id, payer: transactions.payerAccountId, payee: transactions.payeeAccountId, type: transactions.type })
    .from(transactions)
    .where(eq(transactions.id, input.txnId));
  // Same answer for "missing" and "not yours", so ids cannot be probed.
  if (!selected || selected.type === 'funding' || (selected.payer !== input.meAccountId && selected.payee !== input.meAccountId)) {
    throw new AppError(404, 'not_found', 'Transaction not found.');
  }
  const otherId = selected.payer === input.meAccountId ? selected.payee : selected.payer;
  const [me, counterparty] = await Promise.all([party(db, input.meAccountId), party(db, otherId)]);

  const ra = alias(riskAssessments, 'ra');
  const found = await db
    .select({
      id: transactions.id,
      createdAt: transactions.createdAt,
      settledAt: transactions.settledAt,
      type: transactions.type,
      payer: transactions.payerAccountId,
      amountPaise: transactions.amountPaise,
      status: transactions.status,
      note: transactions.note,
      failureReason: transactions.failureReason,
      riskScore: transactions.riskScore,
      riskDecision: transactions.riskDecision,
      firedRules: ra.firedRules,
    })
    .from(transactions)
    .leftJoin(ra, eq(ra.txnId, transactions.id))
    .where(
      or(
        and(eq(transactions.payerAccountId, input.meAccountId), eq(transactions.payeeAccountId, otherId)),
        and(eq(transactions.payerAccountId, otherId), eq(transactions.payeeAccountId, input.meAccountId)),
      ),
    )
    .orderBy(asc(transactions.createdAt));

  const rows: StatementRow[] = found.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    settledAt: r.settledAt,
    type: r.type,
    direction: r.payer === input.meAccountId ? 'sent' : 'received',
    amountPaise: r.amountPaise,
    status: r.status,
    note: r.note,
    failureReason: r.failureReason,
    riskScore: r.riskScore,
    riskDecision: r.riskDecision,
    reasons:
      r.riskDecision && r.riskDecision !== 'allow' && Array.isArray(r.firedRules)
        ? (r.firedRules as FiredRule[]).map((rule) => reasonText(rule, 'en'))
        : [],
  }));

  const settled = rows.filter((r) => r.status === 'settled');
  return {
    me,
    counterparty,
    selectedTxnId: selected.id,
    rows,
    totals: {
      sentPaise: settled.filter((r) => r.direction === 'sent').reduce((s, r) => s + r.amountPaise, 0),
      receivedPaise: settled.filter((r) => r.direction === 'received').reduce((s, r) => s + r.amountPaise, 0),
      count: rows.length,
      held: rows.filter((r) => r.riskDecision === 'hold').length,
      warned: rows.filter((r) => r.riskDecision === 'warn').length,
      failedOrCancelled: rows.filter((r) => r.status === 'failed' || r.status === 'reversed').length,
    },
    generatedAt: input.now ?? new Date(),
  };
}
