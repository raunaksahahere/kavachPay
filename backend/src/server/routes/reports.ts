import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { riskAssessments, transactions } from '@/db/schema';
import { schemas } from '@/lib/api/schemas';
import { accountForUser } from '@/lib/api/users';
import { AppError } from '@/lib/errors';
import { getAccountView } from '@/lib/ledger/payments';
import type { Explanation, FiredRule } from '@/lib/risk/types';
import { counterpartyStatement } from '@/lib/statements/counterparty';
import { renderStatementPdf } from '@/lib/statements/pdf';
import { synthesizeSpeech } from '@/lib/voice/elevenlabs';
import { spokenReason } from '@/lib/voice/script';
import { currentActor } from '../auth';
import { param, query, rateLimit } from '../http';

export const reportRoutes = new Hono();

/**
 * Reads the risk decision for one of the payer's own payments aloud, in
 * English, Hindi or Bengali (ElevenLabs). The words are built on the server
 * from the stored rule trace; the client only picks the language.
 */
reportRoutes.get('/payments/:id/voice', async (c) => {
  const txnId = param(c, 'id');
  const { userId, lang } = query(c, z.object({ userId: schemas.userId.optional(), lang: schemas.lang }));
  const actor = await currentActor(c, userId);
  const db = getDb();
  const me = await accountForUser(db, actor.userId);

  const [row] = await db
    .select({ txn: transactions, risk: riskAssessments })
    .from(transactions)
    .innerJoin(riskAssessments, eq(riskAssessments.txnId, transactions.id))
    .where(eq(transactions.id, txnId));
  // The reason is for the person whose money would leave; same answer for "missing" and "not yours".
  if (!row || row.txn.payerAccountId !== me.accountId || row.txn.type === 'funding') {
    throw new AppError(404, 'not_found', 'Transaction not found.');
  }
  await rateLimit(c, 'voice', actor.userId);

  const payee = await getAccountView(db, row.txn.payeeAccountId);
  const text = spokenReason(
    {
      decision: row.risk.decision,
      score: row.risk.score,
      firedRules: row.risk.firedRules as FiredRule[],
      storedExplanation: (row.risk.explanation as Explanation | null) ?? null,
      txnType: row.txn.type as 'pay' | 'collect',
      amountPaise: row.txn.amountPaise,
      payeeName: payee.name,
    },
    lang,
  );
  const { audio, cached } = await synthesizeSpeech(text, lang);
  return c.body(audio as Uint8Array<ArrayBuffer>, 200, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': String(audio.byteLength),
    'X-Voice-Cached': String(cached),
  });
});

/**
 * PDF of every transaction between the signed-in account and the other party
 * of the selected transaction, with the official places to report fraud.
 */
reportRoutes.get('/transactions/:id/statement', async (c) => {
  const txnId = param(c, 'id');
  const { userId } = query(c, z.object({ userId: schemas.userId.optional() }));
  const actor = await currentActor(c, userId);
  await rateLimit(c, 'report', actor.userId);
  const db = getDb();
  const me = await accountForUser(db, actor.userId);
  const statement = await counterpartyStatement(db, { meAccountId: me.accountId, txnId });
  const pdf = await renderStatementPdf(statement);
  const handle = statement.counterparty.vpa.replace(/[^a-z0-9._-]/gi, '_');
  const day = statement.generatedAt.toISOString().slice(0, 10);
  return c.body(new Uint8Array(pdf), 200, {
    'Content-Type': 'application/pdf',
    'Content-Length': String(pdf.byteLength),
    'Content-Disposition': `attachment; filename="kavach-transactions-${handle}-${day}.pdf"`,
  });
});
