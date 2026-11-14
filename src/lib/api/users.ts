import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '@/db/client';
import { accounts, collectRequests, transactions, users } from '@/db/schema';
import { AppError } from '@/lib/errors';

/** Resolves the acting demo user to their account. There is no login: the demo-user switcher sends the id. */
export async function accountForUser(db: Db, userId: string) {
  const [row] = await db
    .select({
      userId: users.id,
      name: users.name,
      language: users.language,
      accountId: accounts.id,
      vpa: accounts.vpa,
      balancePaise: accounts.balancePaise,
    })
    .from(users)
    .innerJoin(accounts, eq(accounts.userId, users.id))
    .where(eq(users.id, userId));
  if (!row) throw new AppError(404, 'user_not_found', 'Demo user not found. Pick a user again.');
  return row;
}

export async function listDemoUsers(db: Db) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      language: users.language,
      blurb: users.demoBlurb,
      kind: users.kind,
      vpa: accounts.vpa,
    })
    .from(users)
    .innerJoin(accounts, eq(accounts.userId, users.id))
    .where(eq(users.isDemo, true))
    .orderBy(users.kind, users.name);
}

export async function walletView(db: Db, userId: string) {
  const me = await accountForUser(db, userId);
  const payer = alias(accounts, 'payer');
  const payee = alias(accounts, 'payee');
  const payerUser = alias(users, 'payer_user');
  const payeeUser = alias(users, 'payee_user');

  const history = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      status: transactions.status,
      amountPaise: transactions.amountPaise,
      note: transactions.note,
      createdAt: transactions.createdAt,
      riskDecision: transactions.riskDecision,
      riskScore: transactions.riskScore,
      holdUntil: transactions.holdUntil,
      payerAccountId: transactions.payerAccountId,
      payerVpa: payer.vpa,
      payerName: payerUser.name,
      payeeVpa: payee.vpa,
      payeeName: payeeUser.name,
    })
    .from(transactions)
    .innerJoin(payer, eq(payer.id, transactions.payerAccountId))
    .innerJoin(payee, eq(payee.id, transactions.payeeAccountId))
    .leftJoin(payerUser, eq(payerUser.id, payer.userId))
    .leftJoin(payeeUser, eq(payeeUser.id, payee.userId))
    .where(
      and(
        or(eq(transactions.payerAccountId, me.accountId), eq(transactions.payeeAccountId, me.accountId)),
        sql`${transactions.type} <> 'funding'`,
      ),
    )
    .orderBy(desc(transactions.createdAt))
    .limit(30);

  const requester = alias(accounts, 'requester');
  const requesterUser = alias(users, 'requester_user');
  const inbox = await db
    .select({
      id: collectRequests.id,
      amountPaise: collectRequests.amountPaise,
      note: collectRequests.note,
      status: collectRequests.status,
      createdAt: collectRequests.createdAt,
      requesterVpa: requester.vpa,
      requesterName: requesterUser.name,
      openTxnId: sql<string | null>`(
        SELECT t.id FROM transactions t
        WHERE t.collect_request_id = ${collectRequests.id} AND t.status IN ('risk_checked','held')
        ORDER BY t.created_at DESC LIMIT 1)`,
    })
    .from(collectRequests)
    .innerJoin(requester, eq(requester.id, collectRequests.requesterAccountId))
    .leftJoin(requesterUser, eq(requesterUser.id, requester.userId))
    .where(
      and(
        eq(collectRequests.payerAccountId, me.accountId),
        inArray(collectRequests.status, ['pending', 'blocked']),
      ),
    )
    .orderBy(desc(collectRequests.createdAt));

  return {
    me,
    history: history.map((h) => ({ ...h, direction: h.payerAccountId === me.accountId ? 'out' : 'in' })),
    inbox,
  };
}

export async function lookupVpa(db: Db, vpa: string) {
  const [row] = await db
    .select({ vpa: accounts.vpa, name: users.name, kind: accounts.kind })
    .from(accounts)
    .leftJoin(users, eq(users.id, accounts.userId))
    .where(eq(accounts.vpa, vpa));
  if (!row || row.kind === 'system') throw new AppError(404, 'payee_not_found', `No account found for ${vpa}.`);
  return { vpa: row.vpa, name: row.name ?? row.vpa };
}
