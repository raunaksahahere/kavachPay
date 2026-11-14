import { and, eq, inArray } from 'drizzle-orm';
import { APP_CONFIG, type Lang } from '@/config/app';
import { RISK_CONFIG } from '@/config/risk';
import type { Db } from '@/db/client';
import {
  accounts,
  collectRequests,
  riskAssessments,
  transactions,
  users,
  type CollectRequest,
  type Transaction,
} from '@/db/schema';
import type { AiPort, AnalyzeInput } from '@/lib/ai/port';
import { appendAudit } from '@/lib/audit/chain';
import { AppError, notFound } from '@/lib/errors';
import { assessTransaction } from '@/lib/risk/assess';
import type { Assessment, Explanation, FiredRule } from '@/lib/risk/types';
import { verifyPinOrThrow } from '@/lib/security/pin';
import { assertTransition } from './state-machine';
import { confirmAndSettle, failTransaction } from './transfer';

export type Deps = { ai: AiPort | null };

export type AccountView = {
  id: string;
  vpa: string;
  name: string;
  kind: 'user' | 'system';
  userId: string | null;
  openedAt: Date;
};

export async function getAccountView(db: Db, accountId: string): Promise<AccountView> {
  const [row] = await db
    .select({
      id: accounts.id,
      vpa: accounts.vpa,
      kind: accounts.kind,
      userId: accounts.userId,
      openedAt: accounts.openedAt,
      name: users.name,
    })
    .from(accounts)
    .leftJoin(users, eq(users.id, accounts.userId))
    .where(eq(accounts.id, accountId));
  if (!row) throw notFound('Account');
  return { ...row, name: row.name ?? row.vpa };
}

async function getAccountByVpa(db: Db, vpa: string): Promise<AccountView> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.vpa, vpa.trim().toLowerCase()));
  if (!row) throw new AppError(404, 'payee_not_found', `No account found for ${vpa}.`);
  return getAccountView(db, row.id);
}

function validateAmount(amountPaise: number) {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new AppError(400, 'invalid_amount', 'Amount must be a positive whole number of paise.');
  }
  if (amountPaise > APP_CONFIG.maxAmountPaise) {
    throw new AppError(400, 'amount_too_large', 'Amount exceeds the per-payment limit.');
  }
}

export async function getAssessment(db: Db, txnId: string): Promise<Assessment | null> {
  const [row] = await db.select().from(riskAssessments).where(eq(riskAssessments.txnId, txnId));
  if (!row) return null;
  return {
    score: row.score,
    rulesScore: row.rulesScore,
    aiPoints: row.aiPoints,
    decision: row.decision,
    fired: row.firedRules as FiredRule[],
    aiStatus: row.aiStatus as Assessment['aiStatus'],
    aiSignals: row.aiSignals ?? null,
    explanation: row.explanation as Explanation,
  };
}

type InitiateInput = {
  type: 'pay' | 'collect';
  payer: AccountView;
  payee: AccountView;
  amountPaise: number;
  note: string;
  lang: Lang;
  collectRequestId?: string;
  message?: AnalyzeInput;
};

/**
 * initiated -> risk_checked (-> held). No money moves here. The risk decision
 * is computed by deterministic code and stored before the payer can confirm.
 */
async function initiateTransaction(
  db: Db,
  input: InitiateInput,
  deps: Deps,
): Promise<{ txn: Transaction; assessment: Assessment }> {
  const actor = `user:${input.payer.userId ?? input.payer.id}`;

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(transactions)
      .values({
        type: input.type,
        payerAccountId: input.payer.id,
        payeeAccountId: input.payee.id,
        amountPaise: input.amountPaise,
        note: input.note,
        collectRequestId: input.collectRequestId,
      })
      .returning();
    await appendAudit(tx, {
      actor,
      action: 'txn.initiated',
      entityType: 'transaction',
      entityId: row.id,
      payload: {
        type: row.type,
        amountPaise: row.amountPaise,
        payer: row.payerAccountId,
        payee: row.payeeAccountId,
      },
    });
    return row;
  });

  let assessment: Assessment;
  try {
    assessment = await assessTransaction(db, created, {
      lang: input.lang,
      payeeName: input.payee.name,
      ai: deps.ai,
      message: input.message,
    });
  } catch (err) {
    await failTransaction(db, created.id, 'system', 'risk_check_error');
    throw err;
  }

  const txn = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, created.id))
      .for('update');
    assertTransition(locked.status, 'risk_checked');
    const hold = assessment.decision === 'hold';
    if (hold) assertTransition('risk_checked', 'held');
    const now = new Date();

    await tx.insert(riskAssessments).values({
      txnId: created.id,
      score: assessment.score,
      rulesScore: assessment.rulesScore,
      aiPoints: assessment.aiPoints,
      decision: assessment.decision,
      firedRules: assessment.fired,
      aiStatus: assessment.aiStatus,
      aiSignals: assessment.aiSignals,
      explanation: assessment.explanation,
    });
    const [updated] = await tx
      .update(transactions)
      .set({
        status: hold ? 'held' : 'risk_checked',
        riskScore: assessment.score,
        riskDecision: assessment.decision,
        holdUntil: hold ? new Date(now.getTime() + RISK_CONFIG.coolingPeriodMinutes * 60_000) : null,
        updatedAt: now,
      })
      .where(eq(transactions.id, created.id))
      .returning();
    if (hold && input.collectRequestId) {
      await tx
        .update(collectRequests)
        .set({ status: 'blocked' })
        .where(eq(collectRequests.id, input.collectRequestId));
    }
    await appendAudit(tx, {
      actor: 'risk-engine',
      action: hold ? 'txn.held' : 'txn.risk_checked',
      entityType: 'transaction',
      entityId: created.id,
      payload: {
        score: assessment.score,
        rulesScore: assessment.rulesScore,
        aiPoints: assessment.aiPoints,
        decision: assessment.decision,
        rules: assessment.fired.map((r) => r.id),
        aiStatus: assessment.aiStatus,
      },
    });
    return updated;
  });

  return { txn, assessment };
}

export async function payToVpa(
  db: Db,
  input: {
    payerAccountId: string;
    payeeVpa: string;
    amountPaise: number;
    note?: string;
    lang: Lang;
    message?: AnalyzeInput;
  },
  deps: Deps,
) {
  validateAmount(input.amountPaise);
  const payer = await getAccountView(db, input.payerAccountId);
  const payee = await getAccountByVpa(db, input.payeeVpa);
  if (payer.id === payee.id) {
    throw new AppError(400, 'same_account', 'You cannot pay your own account.');
  }
  if (payee.kind === 'system') throw new AppError(400, 'invalid_payee', 'This account cannot receive payments.');
  return initiateTransaction(
    db,
    {
      type: 'pay',
      payer,
      payee,
      amountPaise: input.amountPaise,
      note: (input.note ?? '').slice(0, APP_CONFIG.maxNoteLength),
      lang: input.lang,
      message: input.message,
    },
    deps,
  );
}

/**
 * The payer's final step: checks the hold, the typed confirmation and the PIN,
 * then settles. Money moves only here.
 */
export async function confirmPayment(
  db: Db,
  input: { txnId: string; payerAccountId: string; pin: string; typedAmountPaise?: number },
): Promise<Transaction> {
  const [txn] = await db.select().from(transactions).where(eq(transactions.id, input.txnId));
  if (!txn) throw notFound('Transaction');
  if (txn.payerAccountId !== input.payerAccountId) {
    throw new AppError(403, 'not_payer', 'Only the payer can confirm this payment.');
  }
  if (txn.status !== 'risk_checked' && txn.status !== 'held') {
    throw new AppError(409, 'invalid_state', `This payment is already ${txn.status}.`, {
      status: txn.status,
    });
  }
  if (txn.status === 'held' && txn.holdUntil && txn.holdUntil > new Date()) {
    throw new AppError(423, 'held', 'This payment is on hold for a cooling period.', {
      holdUntil: txn.holdUntil.toISOString(),
    });
  }
  if (txn.riskDecision !== 'allow' && input.typedAmountPaise !== txn.amountPaise) {
    throw new AppError(
      422,
      'confirmation_mismatch',
      'To continue, type the exact amount you are about to send.',
    );
  }

  const payer = await getAccountView(db, txn.payerAccountId);
  if (!payer.userId) throw new AppError(400, 'invalid_payer', 'This account cannot make payments.');
  await verifyPinOrThrow(db, payer.userId, input.pin);

  const result = await confirmAndSettle(db, txn.id, `user:${payer.userId}`);
  if (result.outcome === 'failed') {
    throw new AppError(402, 'insufficient_funds', 'Not enough balance for this payment.', {
      txnId: txn.id,
    });
  }
  return result.txn;
}

export async function cancelPayment(
  db: Db,
  input: { txnId: string; payerAccountId: string },
): Promise<Transaction> {
  const [txn] = await db.select().from(transactions).where(eq(transactions.id, input.txnId));
  if (!txn) throw notFound('Transaction');
  if (txn.payerAccountId !== input.payerAccountId) {
    throw new AppError(403, 'not_payer', 'Only the payer can cancel this payment.');
  }
  return failTransaction(db, txn.id, `user:${input.payerAccountId}`, 'cancelled_by_user');
}

// ---------- Collect requests ----------

export async function createCollectRequest(
  db: Db,
  input: { requesterAccountId: string; payerVpa: string; amountPaise: number; note?: string },
): Promise<CollectRequest> {
  validateAmount(input.amountPaise);
  const requester = await getAccountView(db, input.requesterAccountId);
  const payer = await getAccountByVpa(db, input.payerVpa);
  if (requester.id === payer.id) {
    throw new AppError(400, 'same_account', 'You cannot request money from yourself.');
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(collectRequests)
      .values({
        requesterAccountId: requester.id,
        payerAccountId: payer.id,
        amountPaise: input.amountPaise,
        note: (input.note ?? '').slice(0, APP_CONFIG.maxNoteLength),
      })
      .returning();
    await appendAudit(tx, {
      actor: `user:${requester.userId ?? requester.id}`,
      action: 'collect.created',
      entityType: 'collect_request',
      entityId: row.id,
      payload: { amountPaise: row.amountPaise, payer: payer.id, requester: requester.id },
    });
    return row;
  });
}

/**
 * Approving a collect request starts an OUTGOING payment from the approver.
 * It goes through exactly the same risk check and confirmation as a push payment.
 */
export async function approveCollectRequest(
  db: Db,
  input: { collectRequestId: string; payerAccountId: string; lang: Lang },
  deps: Deps,
) {
  const [request] = await db
    .select()
    .from(collectRequests)
    .where(eq(collectRequests.id, input.collectRequestId));
  if (!request) throw notFound('Collect request');
  if (request.payerAccountId !== input.payerAccountId) {
    throw new AppError(403, 'not_payer', 'This request was not sent to you.');
  }
  if (request.status === 'approved' || request.status === 'declined') {
    throw new AppError(409, 'invalid_state', `This request was already ${request.status}.`, {
      status: request.status,
    });
  }

  // Tapping Approve twice returns the payment already in progress.
  const [active] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.collectRequestId, request.id),
        inArray(transactions.status, ['risk_checked', 'held']),
      ),
    );
  if (active) {
    const assessment = await getAssessment(db, active.id);
    if (assessment) return { txn: active, assessment };
  }

  const payer = await getAccountView(db, request.payerAccountId);
  const payee = await getAccountView(db, request.requesterAccountId);
  return initiateTransaction(
    db,
    {
      type: 'collect',
      payer,
      payee,
      amountPaise: request.amountPaise,
      note: request.note,
      lang: input.lang,
      collectRequestId: request.id,
    },
    deps,
  );
}

export async function declineCollectRequest(
  db: Db,
  input: { collectRequestId: string; payerAccountId: string },
): Promise<CollectRequest> {
  const [request] = await db
    .select()
    .from(collectRequests)
    .where(eq(collectRequests.id, input.collectRequestId));
  if (!request) throw notFound('Collect request');
  if (request.payerAccountId !== input.payerAccountId) {
    throw new AppError(403, 'not_payer', 'This request was not sent to you.');
  }
  if (request.status === 'approved' || request.status === 'declined') {
    throw new AppError(409, 'invalid_state', `This request was already ${request.status}.`, {
      status: request.status,
    });
  }

  const open = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.collectRequestId, request.id),
        inArray(transactions.status, ['initiated', 'risk_checked', 'held']),
      ),
    );
  for (const t of open) {
    await failTransaction(db, t.id, `user:${input.payerAccountId}`, 'collect_declined');
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(collectRequests)
      .set({ status: 'declined', respondedAt: new Date() })
      .where(eq(collectRequests.id, request.id))
      .returning();
    await appendAudit(tx, {
      actor: `user:${input.payerAccountId}`,
      action: 'collect.declined',
      entityType: 'collect_request',
      entityId: row.id,
      payload: {},
    });
    return row;
  });
}
